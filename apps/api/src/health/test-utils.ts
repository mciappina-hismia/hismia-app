import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { START_TIME, startTimeProvider } from './start-time.provider';

export async function createTestApp(): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [startTimeProvider, HealthService],
  })
    .overrideProvider(START_TIME)
    .useValue({ getStartTime: () => new Date('2026-01-01T00:00:00Z') })
    .compile();

  const adapter = new FastifyAdapter();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(adapter);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}