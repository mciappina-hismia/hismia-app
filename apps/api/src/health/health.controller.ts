import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@hismia/types';
import { START_TIME, type StartTimeProvider } from './start-time.provider';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(START_TIME) private readonly startTime: StartTimeProvider,
  ) {}

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