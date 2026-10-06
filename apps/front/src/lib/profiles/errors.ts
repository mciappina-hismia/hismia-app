// Boundary diagnostics only: never retain provider messages, tokens or raw bodies.
export type ProfileBoundaryError =
  | {
      category: 'validation' | 'authentication' | 'conflict' | 'transient' | 'unexpected';
      status?: number;
    }
  | { category: 'transport' | 'decoding' | 'contract' };

export type ProfileFailure =
  | { kind: 'invalid'; error: ProfileBoundaryError }
  | { kind: 'signin'; error: ProfileBoundaryError }
  | { kind: 'conflict'; error: ProfileBoundaryError }
  | { kind: 'unavailable'; error: ProfileBoundaryError };

export function httpFailure(status: number): ProfileFailure {
  if (status === 401 || status === 403)
    return { kind: 'signin', error: { category: 'authentication', status } };
  if (status === 400) return { kind: 'invalid', error: { category: 'validation', status } };
  if (status === 409) return { kind: 'conflict', error: { category: 'conflict', status } };
  return {
    kind: 'unavailable',
    error: {
      category: status === 429 || (status >= 500 && status <= 599) ? 'transient' : 'unexpected',
      status,
    },
  };
}

export function exceptionFailure(
  error: unknown,
  phase: 'transport' | 'decoding',
): Extract<ProfileFailure, { kind: 'unavailable' }> {
  return {
    kind: 'unavailable',
    error: {
      category:
        phase === 'decoding' && error instanceof SyntaxError
          ? 'decoding'
          : error instanceof TypeError ||
              (error instanceof DOMException && error.name === 'AbortError')
            ? 'transport'
            : 'unexpected',
    },
  };
}

export function authenticationFailure(): Extract<ProfileFailure, { kind: 'signin' }> {
  return { kind: 'signin', error: { category: 'authentication' } };
}
