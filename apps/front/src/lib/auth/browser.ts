import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** Public browser credentials only. Never instantiate during server rendering. */
export function browserAuth(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const endpoint = new URL(url);
    if (
      endpoint.protocol !== 'https:' ||
      !endpoint.hostname ||
      endpoint.username ||
      endpoint.password ||
      endpoint.pathname !== '/' ||
      endpoint.search ||
      endpoint.hash
    )
      return null;
    client ??= createClient(endpoint.origin, key, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    return client;
  } catch {
    return null;
  }
}

export async function confirmedUser(auth: SupabaseClient): Promise<boolean> {
  const { data, error } = await auth.auth.getUser();
  return !error && Boolean(data.user?.email_confirmed_at);
}

export const CONFIRM_PATH = '/auth/confirm';
export const RECOVERY_PATH = '/auth/recover';
export const RESET_PASSWORD_PATH = '/auth/reset-password';
export const ONBOARDING_PATH = '/onboarding';

export function cleanCallbackUrl(): string | null {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  // Remove all query and fragment parameters, including provider errors and unsafe redirects.
  window.history.replaceState(null, '', url.pathname);
  return code;
}
