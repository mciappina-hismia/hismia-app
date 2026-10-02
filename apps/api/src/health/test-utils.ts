import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { startTimeProvider } from './start-time.provider.js';

export function createTestApp(): INestApplication {
  const moduleRef = Test.createTestingModule({
    controllers: [HealthController],
    providers: [startTimeProvider],
  }).compile();

  return moduleRef.then((m) => m.createNestApplication());
}