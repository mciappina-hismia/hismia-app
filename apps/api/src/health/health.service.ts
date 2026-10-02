import { Inject, Injectable } from '@nestjs/common';
import type { HealthStatus } from '@hismia/types';
import { START_TIME, type StartTimeProvider } from './start-time.provider';
import type { HealthCheckReport, HealthCheckResult } from './health-check.types';

@Injectable()
export class HealthService {
  constructor(
    @Inject(START_TIME) private readonly startTime: StartTimeProvider,
  ) {}

  async getReport(): Promise<HealthCheckReport> {
    const uptimeSeconds = Math.max(
      0,
      Math.floor((Date.now() - this.startTime.getStartTime().getTime()) / 1000),
    );

    const checks = await this.runChecks();

    return {
      status: this.aggregateStatus(checks),
      apiVersion: 'v1',
      uptimeSeconds,
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  private async runChecks(): Promise<readonly HealthCheckResult[]> {
    return [this.getUptimeCheck()];
  }

  private getUptimeCheck(): HealthCheckResult {
    const startedAt = this.startTime.getStartTime();
    return {
      name: 'uptime',
      status: 'ok',
      durationMs: Date.now() - startedAt.getTime(),
    };
  }

  private aggregateStatus(checks: readonly HealthCheckResult[]): HealthStatus {
    if (checks.some((c) => c.status === 'down')) {
      return 'down';
    }
    if (checks.some((c) => c.status === 'degraded')) {
      return 'degraded';
    }
    return 'ok';
  }
}