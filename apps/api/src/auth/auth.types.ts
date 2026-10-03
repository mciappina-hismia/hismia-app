import type { JWTPayload, JWTVerifyGetKey } from 'jose';

export interface IdentityClaims extends JWTPayload {
  sub: string;
  email: string;
  aud: string | string[];
  iss: string;
  exp: number;
  iat: number;
  role: 'authenticated';
  app_metadata?: Record<string, unknown>;
  /** User-editable and untrusted; never use for authorization. */
  user_metadata?: Record<string, unknown>;
  amr?: unknown;
  session_id?: string;
  is_anonymous?: boolean;
  phone?: string;
}

export interface AuthenticatedUser {
  sub: string;
  email: string;
  confirmedEmail: boolean;
  role: 'authenticated';
  appMetadata: unknown;
  rawClaims: IdentityClaims;
}

export type AuthErrorCode =
  | 'MISSING_TOKEN'
  | 'INVALID_TOKEN'
  | 'EXPIRED_TOKEN'
  | 'WRONG_ISSUER'
  | 'WRONG_AUDIENCE'
  | 'NOT_CONFIRMED'
  | 'SUPABASE_UNREACHABLE';

export class AuthError extends Error {
  readonly status = 401;
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface AuthDeps {
  jwks: JWTVerifyGetKey;
  issuer: string;
  audience: string;
  supabase: {
    auth: {
      getUser: (jwt: string) => Promise<{
        data: { user: { id: string; email?: string; email_confirmed_at?: string | null } | null };
        error: unknown;
      }>;
    };
  };
}
