import type { HealthStatus } from '@hismia/types';

export interface HealthCheckResult {
  readonly name: string;
  readonly status: HealthStatus;
  readonly detail?: string;
  readonly durationMs?: number;
}

export interface HealthCheckReport {
  readonly status: HealthStatus;
  readonly apiVersion: string;
  readonly uptimeSeconds: number;
  readonly checks: readonly HealthCheckResult[];
  readonly timestamp: string;
}

export const HEALTH_CHECK_NAMES = {
  database: 'database',
  storage: 'storage',
  auth: 'auth',
  sentry: 'sentry',
} as const;

export type HealthCheckName = (typeof HEALTH_CHECK_NAMES)[keyof typeof HEALTH_CHECK_NAMES];