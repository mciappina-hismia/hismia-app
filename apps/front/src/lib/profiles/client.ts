import { accountProfileSchema } from '@hismia/validation';
import type { AccountProfileInput, PersistedProfile } from '@hismia/types';

export type GateResult = { kind: 'ready'; subject: string } | { kind: 'signin' | 'unavailable' };
export type SaveResult =
  | { kind: 'saved'; profile: PersistedProfile }
  | { kind: 'invalid' | 'signin' | 'conflict' | 'unavailable' };

function failure(status: number): Exclude<SaveResult, { kind: 'saved' }> {
  if (status === 401 || status === 403) return { kind: 'signin' };
  if (status === 400) return { kind: 'invalid' };
  if (status === 409) return { kind: 'conflict' };
  return { kind: 'unavailable' };
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
  if (!token) return { kind: 'signin' };
  try {
    const response = await fetch('/api/hismia/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok)
      return response.status === 401 || response.status === 403
        ? { kind: 'signin' }
        : { kind: 'unavailable' };
    const body: unknown = await response.json();
    if (
      !object(body) ||
      typeof body.sub !== 'string' ||
      !body.sub ||
      typeof body.email !== 'string' ||
      !body.email ||
      body.role !== 'authenticated'
    )
      return { kind: 'unavailable' };
    return { kind: 'ready', subject: body.sub };
  } catch {
    return { kind: 'unavailable' };
  }
}

export async function createProfile(
  token: string,
  input: AccountProfileInput,
  asOf: string,
): Promise<SaveResult> {
  if (!token) return { kind: 'signin' };
  const parsed = accountProfileSchema(asOf).safeParse(input);
  if (
    !parsed.success ||
    (parsed.data.accountType === 'patient' && parsed.data.birthDate.length !== 10)
  )
    return { kind: 'invalid' };
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
  try {
    const response = await fetch('/api/hismia/profiles/onboarding', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return failure(response.status);
    const body: unknown = await response.json();
    if (!object(body) || !timestamp(body.createdAt) || !timestamp(body.updatedAt))
      return { kind: 'unavailable' };
    // The timestamps are server-generated; verify the remainder against the shared contract.
    const { createdAt, updatedAt, ...fields } = body;
    const persisted = accountProfileSchema(asOf).safeParse(fields);
    if (!persisted.success || persisted.data.accountType !== payload.accountType)
      return { kind: 'unavailable' };
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
  } catch {
    return { kind: 'unavailable' };
  }
}
