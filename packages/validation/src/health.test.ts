import { describe, expect, it } from 'vitest';
import { healthCheckSchema } from './health.js';

describe('healthCheckSchema', () => {
  it('accepts a valid health payload', () => {
    const result = healthCheckSchema.safeParse({
      status: 'ok',
      apiVersion: 'v1',
      uptimeSeconds: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown status value', () => {
    const result = healthCheckSchema.safeParse({
      status: 'green',
      apiVersion: 'v1',
      uptimeSeconds: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an apiVersion that does not match vN', () => {
    const result = healthCheckSchema.safeParse({
      status: 'ok',
      apiVersion: '1.0.0',
      uptimeSeconds: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative uptime', () => {
    const result = healthCheckSchema.safeParse({
      status: 'ok',
      apiVersion: 'v1',
      uptimeSeconds: -1,
    });
    expect(result.success).toBe(false);
  });
});