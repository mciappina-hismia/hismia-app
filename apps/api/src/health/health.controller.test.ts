import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp } from './test-utils.js';

describe('HealthController (GET /health)', () => {
  it('returns 200 with status ok and apiVersion v1', async () => {
    const app = createTestApp();

    const response = await request(app).get('/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      apiVersion: 'v1',
    });
    expect(typeof response.body.uptimeSeconds).toBe('number');
  });
});