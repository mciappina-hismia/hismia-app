import { Controller, Get } from '@nestjs/common';
import type { HealthCheckReport } from './health-check.types';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  getHealth(): Promise<HealthCheckReport> {
    return this.health.getReport();
  }
}