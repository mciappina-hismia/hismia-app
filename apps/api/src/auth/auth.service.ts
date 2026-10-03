import { Injectable } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import type { AuthDeps, AuthenticatedUser, IdentityClaims } from './auth.types';
import { AuthError } from './auth.types';

export async function verifyAccessToken(token: string, deps: AuthDeps): Promise<IdentityClaims> {
  if (!token) throw new AuthError('MISSING_TOKEN', 'Bearer access token required');
  try {
    const { payload } = await jwtVerify(token, deps.jwks, {
      issuer: deps.issuer,
      audience: deps.audience,
      algorithms: ['RS256', 'ES256'],
    });
    if (
      payload.role !== 'authenticated' ||
      payload.is_anonymous === true ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.email !== 'string' ||
      !payload.email ||
      typeof payload.exp !== 'number' ||
      typeof payload.iat !== 'number'
    ) {
      throw new AuthError('INVALID_TOKEN', 'Invalid authenticated identity');
    }
    return payload as IdentityClaims;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof errors.JWTExpired)
      throw new AuthError('EXPIRED_TOKEN', 'Access token expired');
    if (error instanceof errors.JWTClaimValidationFailed) {
      if (error.claim === 'iss') throw new AuthError('WRONG_ISSUER', 'Wrong token issuer');
      if (error.claim === 'aud') throw new AuthError('WRONG_AUDIENCE', 'Wrong token audience');
    }
    if (error instanceof errors.JOSEError)
      throw new AuthError('INVALID_TOKEN', 'Invalid access token');
    throw new AuthError('SUPABASE_UNREACHABLE', 'Identity provider unavailable');
  }
}

export async function fetchConfirmedUser(
  token: string,
  deps: AuthDeps,
): Promise<AuthenticatedUser> {
  const claims = await verifyAccessToken(token, deps);
  let result: Awaited<ReturnType<AuthDeps['supabase']['auth']['getUser']>>;
  try {
    result = await deps.supabase.auth.getUser(token);
  } catch {
    throw new AuthError('SUPABASE_UNREACHABLE', 'Identity provider unavailable');
  }
  if (
    result.error ||
    !result.data.user ||
    result.data.user.id !== claims.sub ||
    result.data.user.email !== claims.email
  ) {
    throw new AuthError('INVALID_TOKEN', 'Identity provider rejected access token');
  }
  if (!result.data.user.email_confirmed_at) {
    throw new AuthError('NOT_CONFIRMED', 'Email confirmation required');
  }
  return {
    sub: claims.sub,
    email: claims.email,
    confirmedEmail: true,
    role: 'authenticated',
    appMetadata: claims.app_metadata,
    rawClaims: claims,
  };
}

@Injectable()
export class AuthService {
  private readonly deps: AuthDeps;

  constructor(
    confirmedUser: { id: string; email: string; email_confirmed_at: string | null } | null = null,
  ) {
    const useMock = process.env.AUTH_USE_MOCK === 'true';
    if (useMock && process.env.NODE_ENV === 'production') {
      throw new Error('Mock identity providers are not allowed in production');
    }
    const projectUrl = process.env.SUPABASE_PROJECT_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const jwksUrl = process.env.SUPABASE_JWKS_URL;
    const issuer = process.env.SUPABASE_ISSUER;
    const audience = process.env.SUPABASE_AUDIENCE;
    if (!projectUrl || (!useMock && !anonKey) || !jwksUrl || !issuer || !audience) {
      throw new Error('Missing Supabase identity configuration');
    }
    const fakeSupabaseClient = {
      auth: { getUser: async () => ({ data: { user: confirmedUser }, error: null }) },
    };
    this.deps = {
      issuer,
      audience,
      jwks: createRemoteJWKSet(new URL(jwksUrl)),
      supabase: useMock
        ? fakeSupabaseClient
        : createClient(projectUrl, anonKey!, {
            auth: { persistSession: false, autoRefreshToken: false },
          }),
    };
  }

  authenticate(token: string): Promise<AuthenticatedUser> {
    return fetchConfirmedUser(token, this.deps);
  }
}
