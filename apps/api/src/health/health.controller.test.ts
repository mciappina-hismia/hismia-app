import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { HealthResponse } from '@hismia/types';
import { healthCheckSchema } from '@hismia/validation';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './test-utils';

describe('HealthController (GET /health)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with a payload accepted by the shared schema', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      apiVersion: 'v1',
    });
    expect(typeof response.body.uptimeSeconds).toBe('number');

    const parsed: HealthResponse = healthCheckSchema.parse(response.body) as HealthResponse;
    expect(parsed.status).toBe('ok');
  });
});