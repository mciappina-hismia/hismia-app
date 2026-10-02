import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { startTimeProvider } from './health/start-time.provider';

@Module({
  controllers: [HealthController],
  providers: [startTimeProvider, HealthService],
})
export class AppModule {}