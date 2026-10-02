import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { startTimeProvider } from './health/start-time.provider.js';

@Module({
  controllers: [HealthController],
  providers: [startTimeProvider],
})
export class AppModule {}