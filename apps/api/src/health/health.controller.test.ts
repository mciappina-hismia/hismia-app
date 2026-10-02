import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { HealthResponse } from '@hismia/types';
import { healthCheckSchema } from '@hismia/validation';
import { createTestApp } from './test-utils.js';

describe('HealthController (GET /health)', () => {
  it('returns 200 with a payload accepted by the shared schema', async () => {
    const app = await createTestApp();

    const response = await request(app).get('/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      apiVersion: 'v1',
    });
    expect(typeof response.body.uptimeSeconds).toBe('number');

    const parsed: HealthResponse = healthCheckSchema.parse(response.body);
    expect(parsed.status).toBe('ok');
  });
});