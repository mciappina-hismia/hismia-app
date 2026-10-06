import { accountProfileSchema } from '@hismia/validation';
import type { AccountProfileInput, PersistedProfile } from '@hismia/types';
import {
  authenticationFailure,
  exceptionFailure,
  httpFailure,
  type ProfileFailure,
} from './errors';

export type GateResult =
  { kind: 'ready'; subject: string } | Extract<ProfileFailure, { kind: 'signin' | 'unavailable' }>;
export type SaveResult = { kind: 'saved'; profile: PersistedProfile } | ProfileFailure;

function gateFailure(failure: ProfileFailure): Exclude<GateResult, { kind: 'ready' }> {
  return failure.kind === 'signin' ? failure : { kind: 'unavailable', error: failure.error };
}

const contractFailure = { kind: 'unavailable', error: { category: 'contract' } } as const;

// Keep fetch rejection and JSON decoding separate; neither exposes raw provider data.
async function request(
  url: string,
  options: RequestInit,
): Promise<{ kind: 'response'; body: unknown } | ProfileFailure> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    return exceptionFailure(error, 'transport');
  }
  if (!response.ok) return httpFailure(response.status);
  try {
    const body: unknown = await response.json();
    return { kind: 'response', body };
  } catch (error) {
    return exceptionFailure(error, 'decoding');
  }
}

function timestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function verifyAccount(token: string): Promise<GateResult> {
  if (!token) return authenticationFailure();
  const response = await request('/api/hismia/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (response.kind !== 'response') return gateFailure(response);
  const body = response.body;
  if (
    !object(body) ||
    typeof body.sub !== 'string' ||
    !body.sub ||
    typeof body.email !== 'string' ||
    !body.email ||
    body.role !== 'authenticated'
  )
    return contractFailure;
  return { kind: 'ready', subject: body.sub };
}

// Small identity port: the installed SDK satisfies it, tests need no provider session.
type AccountAuth = {
  getUser: () => Promise<{
    data: { user: { id: string; email_confirmed_at?: string } | null };
    error: unknown;
  }>;
  getSession: () => Promise<{
    data: { session: { access_token: string; user: { id: string } } | null };
    error: unknown;
  }>;
};
export type CheckedAccount =
  { kind: 'ready'; subject: string; token: string } | Exclude<GateResult, { kind: 'ready' }>;

function providerFailure(error: unknown): Exclude<GateResult, { kind: 'ready' }> {
  if (object(error) && typeof error.status === 'number')
    return gateFailure(httpFailure(error.status));
  return exceptionFailure(error, 'transport');
}

export async function checkedAccount(
  auth: AccountAuth,
  verify: (token: string) => Promise<GateResult> = verifyAccount,
): Promise<CheckedAccount> {
  try {
    const { data: userData, error: userError } = await auth.getUser();
    if (userError) return providerFailure(userError);
    const user = userData.user;
    if (!user?.id || !user.email_confirmed_at) return authenticationFailure();
    const { data: sessionData, error: sessionError } = await auth.getSession();
    if (sessionError) return providerFailure(sessionError);
    const session = sessionData.session;
    if (!session?.access_token || session.user?.id !== user.id) return authenticationFailure();
    const gate = await verify(session.access_token);
    if (gate.kind !== 'ready') return gate;
    if (gate.subject !== user.id) return authenticationFailure();
    return { kind: 'ready', subject: user.id, token: session.access_token };
  } catch (error) {
    return providerFailure(error);
  }
}

export async function createProfile(
  token: string,
  input: AccountProfileInput,
  asOf: string,
): Promise<SaveResult> {
  if (!token) return authenticationFailure();
  const parsed = accountProfileSchema(asOf).safeParse(input);
  if (
    !parsed.success ||
    (parsed.data.accountType === 'patient' && parsed.data.birthDate.length !== 10)
  )
    return { kind: 'invalid', error: { category: 'validation' } };
  // Parse into an allowlisted wire object: never forward a subject or privileged client fields.
  const data = parsed.data;
  const payload: AccountProfileInput =
    data.accountType === 'patient'
      ? {
          accountType: 'patient',
          displayName: data.displayName,
          birthDate: data.birthDate,
          residenceLocality: data.residenceLocality,
          ...(data.gender === undefined ? {} : { gender: data.gender }),
        }
      : data;
  const response = await request('/api/hismia/profiles/onboarding', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (response.kind !== 'response') return response;
  const body = response.body;
  if (!object(body) || !timestamp(body.createdAt) || !timestamp(body.updatedAt))
    return contractFailure;
  // The timestamps are server-generated; verify the remainder against the shared contract.
  const { createdAt, updatedAt, ...fields } = body;
  const persisted = accountProfileSchema(asOf).safeParse(fields);
  if (!persisted.success || persisted.data.accountType !== payload.accountType)
    return contractFailure;
  const clean = persisted.data;
  const result: PersistedProfile =
    clean.accountType === 'patient'
      ? {
          accountType: 'patient',
          displayName: clean.displayName,
          birthDate: clean.birthDate,
          residenceLocality: clean.residenceLocality,
          ...(clean.gender === undefined ? {} : { gender: clean.gender }),
          createdAt,
          updatedAt,
        }
      : { ...clean, createdAt, updatedAt };
  return { kind: 'saved', profile: result };
}
