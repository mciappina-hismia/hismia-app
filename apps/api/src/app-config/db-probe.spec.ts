import { describe, it, expect } from 'vitest';
import { probeDb, TRANSACTION_CODES, __test__ } from './db-probe.js';
import type { DbClient, TxClient } from './db-probe.js';

const { isSingleSafeTrue } = __test__;

interface Step {
  kind: 'execute' | 'query';
  result: unknown;
}

function makeClient(steps: Step[]): DbClient {
  let i = 0;
  const tx: TxClient = {
    $executeRawUnsafe: async (_query: string) => {
      const step = steps[i++];
      if (!step || step.kind !== 'execute') {
        throw new Error(`expected execute at step ${i - 1}, got ${step?.kind ?? 'EOF'}`);
      }
      return undefined;
    },
    $queryRawUnsafe: async <T = unknown>(_query: string): Promise<T> => {
      const step = steps[i++];
      if (!step || step.kind !== 'query') {
        throw new Error(`expected query at step ${i - 1}, got ${step?.kind ?? 'EOF'}`);
      }
      return step.result as T;
    },
  };
  return {
    $transaction: async (fn) => fn(tx),
    $disconnect: async () => {},
  };
}

function rejectTransaction(code: string | null): DbClient {
  return {
    $transaction: () => {
      if (code === null) return Promise.reject(new Error('boom'));
      const e: Error & { errorCode?: string } = new Error('boom');
      e.errorCode = code;
      return Promise.reject(e);
    },
    $disconnect: async () => {},
  };
}

describe('isSingleSafeTrue', () => {
  it('accepts a single row with safe=true', () => {
    expect(isSingleSafeTrue([{ safe: true }])).toBe(true);
  });
  it('rejects an empty array', () => {
    expect(isSingleSafeTrue([])).toBe(false);
  });
  it('rejects more than one row', () => {
    expect(isSingleSafeTrue([{ safe: true }, { safe: true }])).toBe(false);
  });
  it('rejects a row with safe=false', () => {
    expect(isSingleSafeTrue([{ safe: false }])).toBe(false);
  });
  it('rejects a row without a safe column', () => {
    expect(isSingleSafeTrue([{}])).toBe(false);
  });
  it('rejects non-array values', () => {
    expect(isSingleSafeTrue(null)).toBe(false);
    expect(isSingleSafeTrue({ safe: true })).toBe(false);
  });
});

describe('probeDb', () => {
  it('returns null on a successful probe', async () => {
    const client = makeClient([
      { kind: 'execute', result: undefined },
      { kind: 'execute', result: undefined },
      { kind: 'execute', result: undefined },
      { kind: 'query', result: [{ safe: true }] },
      { kind: 'query', result: [{ safe: true }] },
    ]);
    expect(await probeDb({ client })).toBeNull();
  });

  it('returns CATALOG when the catalog query is not safe', async () => {
    const client = makeClient([
      { kind: 'execute', result: undefined },
      { kind: 'execute', result: undefined },
      { kind: 'execute', result: undefined },
      { kind: 'query', result: [{ safe: false }] },
    ]);
    expect(await probeDb({ client })).toBe('CATALOG');
  });

  it('returns VISIBILITY when the visibility query is not safe', async () => {
    const client = makeClient([
      { kind: 'execute', result: undefined },
      { kind: 'execute', result: undefined },
      { kind: 'execute', result: undefined },
      { kind: 'query', result: [{ safe: true }] },
      { kind: 'query', result: [{ safe: false }] },
    ]);
    expect(await probeDb({ client })).toBe('VISIBILITY');
  });

  it('returns a fixed TRANSACTION_<code> for an allowlisted Prisma rejection', async () => {
    expect(await probeDb({ client: rejectTransaction('P1011') })).toBe('TRANSACTION_P1011');
  });

  it('returns TRANSACTION_UNKNOWN for a pre-callback rejection with no allowlisted code', async () => {
    expect(await probeDb({ client: rejectTransaction(null) })).toBe('TRANSACTION_UNKNOWN');
  });

  it('falls back to error.code when errorCode is not a string', async () => {
    const client: DbClient = {
      $transaction: () => {
        const e: Error & { code?: string } = new Error('boom');
        e.code = 'P2024';
        return Promise.reject(e);
      },
      $disconnect: async () => {},
    };
    expect(await probeDb({ client })).toBe('TRANSACTION_P2024');
  });
});

describe('TRANSACTION_CODES', () => {
  it('is the allowlist of fixed Prisma pre-callback codes', () => {
    for (const code of ['P1000', 'P1001', 'P1002', 'P1003', 'P1011', 'P1017', 'P2024', 'P2028']) {
      expect(TRANSACTION_CODES.has(code)).toBe(true);
    }
  });
});
