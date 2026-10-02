export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthResponse {
  status: HealthStatus;
  apiVersion: ApiVersion;
  uptimeSeconds: number;
}

export type ApiVersion = `v${number}`;