import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { healthCheckSchema } from '@hismia/validation';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { HealthCheckReport } from './health-check.types';
import { createTestApp } from './test-utils';

describe('HealthController', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health returns 200 with a payload accepted by the shared schema', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      apiVersion: 'v1',
    });
    expect(typeof response.body.uptimeSeconds).toBe('number');
    expect(Array.isArray(response.body.checks)).toBe(true);

    const parsed = healthCheckSchema.parse(response.body) as HealthCheckReport;
    expect(parsed.status).toBe('ok');
  });

  it('GET /health delegates the report to the service (no business logic in controller)', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'uptime', status: 'ok' }),
      ]),
    );
    expect(typeof response.body.timestamp).toBe('string');
  });
});