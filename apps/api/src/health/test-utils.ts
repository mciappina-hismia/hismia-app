import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { START_TIME, startTimeProvider } from './start-time.provider.js';

export function createTestApp(): Promise<INestApplication> {
  return Test.createTestingModule({
    controllers: [HealthController],
    providers: [startTimeProvider],
  })
    .overrideProvider(START_TIME)
    .useValue({ getStartTime: () => new Date('2026-01-01T00:00:00Z') })
    .compile()
    .then((m) => m.createNestApplication());
}