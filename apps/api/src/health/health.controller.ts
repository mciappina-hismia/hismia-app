import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@hismia/types';
import type { StartTimeProvider } from './start-time.provider.js';
import { START_TIME } from './start-time.provider.js';

@Controller('health')
export class HealthController {
  constructor(private readonly startTime: InstanceType<StartTimeProvider>) {}

  @Get()
  getHealth(): HealthResponse {
    const uptimeSeconds = Math.max(
      0,
      Math.floor((Date.now() - this.startTime.getStartTime().getTime()) / 1000),
    );
    return {
      status: 'ok',
      apiVersion: 'v1',
      uptimeSeconds,
    };
  }
}