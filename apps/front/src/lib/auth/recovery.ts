import type { SupabaseClient } from '@supabase/supabase-js';
import { RESET_PASSWORD_PATH } from './browser';

export const MIN_PASSWORD_LENGTH = 6;
export const RECOVERY_MESSAGE =
  'Si este email puede ser recuperado, un enlace de recuperación llegará en los próximos minutos. Revisa tu carpeta de spam.';

export interface RecoveryPort {
  /** Subject only when the SDK confirms local recovery provenance. Not server authorization. */
  exchange(code: string, flowId: string | null): Promise<string | null>;
  currentSubject(): Promise<string | null>;
  updatePassword(password: string): Promise<boolean>;
  signOut(): Promise<boolean>;
}

/** Auth-js 2.117.2 returns this metadata at runtime but omits it from AuthTokenResponse. */
export function hasRecoveryRedirect(data: unknown): data is { redirectType: 'recovery' } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'redirectType' in data &&
    data.redirectType === 'recovery'
  );
}

export function supabaseRecovery(auth: SupabaseClient): RecoveryPort {
  return {
    async exchange(code, flowId) {
      const { data, error } = await auth.auth.exchangeCodeForSession(
        code,
        flowId === null ? undefined : { flowId },
      );
      return !error && hasRecoveryRedirect(data) ? (data.session?.user.id ?? null) : null;
    },
    async currentSubject() {
      const { data, error } = await auth.auth.getSession();
      return error ? null : (data.session?.user.id ?? null);
    },
    async updatePassword(password) {
      const { error } = await auth.auth.updateUser({ password });
      return !error;
    },
    async signOut() {
      const { error } = await auth.auth.signOut({ scope: 'local' });
      return !error;
    },
  };
}

export async function requestRecovery(
  auth: Pick<SupabaseClient, 'auth'>,
  email: string,
  origin: string,
): Promise<void> {
  // Account existence and provider failures must have the same public response.
  try {
    await auth.auth.resetPasswordForEmail(email, { redirectTo: `${origin}${RESET_PASSWORD_PATH}` });
  } catch {
    // The caller shows RECOVERY_MESSAGE regardless of provider outcome.
  }
}

export interface RecoveryCallback {
  code: string | null;
  flowId: string | null;
  invalid: boolean;
}

export function consumeRecoveryCallback(): RecoveryCallback {
  const url = new URL(window.location.href);
  const callback = {
    code: url.searchParams.get('code'),
    flowId: url.searchParams.get('sb_flow_id'),
    invalid:
      Boolean(url.hash) ||
      ['error', 'error_code', 'error_description'].some((key) => url.searchParams.has(key)) ||
      url.searchParams.getAll('code').length > 1 ||
      url.searchParams.getAll('sb_flow_id').length > 1,
  };
  window.history.replaceState(window.history.state, '', url.pathname);
  return callback;
}

export type PasswordResult =
  'saved' | 'invalid-password' | 'no-recovery' | 'update-failed' | 'signout-failed' | 'busy';

/** One instance per mounted visit, not a global/cache of recovery permission. */
export function createRecovery(port: RecoveryPort) {
  let opening: Promise<boolean> | null = null;
  let subject: string | null = null;
  let busy = false;
  return {
    open(callback: RecoveryCallback): Promise<boolean> {
      opening ??= (async () => {
        if (callback.invalid || !callback.code) return false;
        try {
          subject = await port.exchange(callback.code, callback.flowId);
          return Boolean(subject);
        } catch {
          return false;
        }
      })();
      return opening;
    },
    async changePassword(password: string): Promise<PasswordResult> {
      if (busy) return 'busy';
      if (!subject) return 'no-recovery';
      if (password.length < MIN_PASSWORD_LENGTH) return 'invalid-password';
      busy = true;
      try {
        try {
          if ((await port.currentSubject()) !== subject) {
            subject = null;
            return 'no-recovery';
          }
          if (!(await port.updatePassword(password))) return 'update-failed';
        } catch {
          return 'update-failed';
        }
        // A successful update must not be repeated, even if local logout fails.
        subject = null;
        try {
          return (await port.signOut()) ? 'saved' : 'signout-failed';
        } catch {
          return 'signout-failed';
        }
      } finally {
        busy = false;
      }
    },
  };
}
