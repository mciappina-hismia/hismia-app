import { describe, expect, it } from 'vitest';
import { HealthService } from './health.service';
import { START_TIME, type StartTimeProvider } from './start-time.provider';

function makeService(startTime: Date): HealthService {
  const provider: StartTimeProvider = { getStartTime: () => startTime };
  const service = Object.create(HealthService.prototype) as HealthService;
  Reflect.set(service, 'startTime', provider);
  Reflect.set(service, START_TIME, provider);
  return service;
}

describe('HealthService', () => {
  it('returns ok status when no check fails', async () => {
    const service = makeService(new Date());

    const report = await service.getReport();

    expect(report.status).toBe('ok');
  });

  it('includes apiVersion v1 and a non-negative uptimeSeconds', async () => {
    const startedAt = new Date('2026-01-01T00:00:00Z');
    const service = makeService(startedAt);

    const report = await service.getReport();

    expect(report.apiVersion).toBe('v1');
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('includes a single synthetic uptime check marked ok', async () => {
    const service = makeService(new Date());

    const report = await service.getReport();

    expect(report.checks).toHaveLength(1);
    expect(report.checks[0]).toMatchObject({ name: 'uptime', status: 'ok' });
    expect(typeof report.checks[0]?.durationMs).toBe('number');
  });

  it('emits a valid ISO timestamp', async () => {
    const service = makeService(new Date());

    const report = await service.getReport();

    expect(() => new Date(report.timestamp)).not.toThrow();
    expect(Number.isNaN(Date.parse(report.timestamp))).toBe(false);
  });
});