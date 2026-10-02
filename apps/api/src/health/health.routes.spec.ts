import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './test-utils';

describe('Health routes (e2e)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health returns 200 and a JSON body with the health report shape', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('Accept', 'application/json')
      .expect(200)
      .expect('content-type', /application\/json/);

    expect(response.body).toMatchObject({
      status: expect.stringMatching(/^(ok|degraded|down)$/),
      apiVersion: 'v1',
      uptimeSeconds: expect.any(Number),
      timestamp: expect.any(String),
    });
    expect(Array.isArray(response.body.checks)).toBe(true);
  });

  it('GET /health never returns 5xx for a healthy process', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBeLessThan(500);
  });

  it('GET /health responds fast (under 200ms in test env)', async () => {
    const start = Date.now();
    await request(app.getHttpServer()).get('/health').expect(200);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(200);
  });
});