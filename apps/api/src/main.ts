import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { AppModule } from './app.module.js';

const DEFAULT_PORT = 3001;
const DEFAULT_RATE_LIMIT_MAX = 100;
const DEFAULT_RATE_LIMIT_WINDOW = '1 minute';
const port = Number.parseInt(process.env.PORT ?? `${DEFAULT_PORT}`, 10);
const rateLimitMax = Number.parseInt(
  process.env.RATE_LIMIT_MAX ?? `${DEFAULT_RATE_LIMIT_MAX}`,
  10,
);

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter();
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    max: rateLimitMax,
    timeWindow: DEFAULT_RATE_LIMIT_WINDOW,
  });

  await app.listen(port, '0.0.0.0');
  console.info(`Hismia API listening on port ${port}`);
}

void bootstrap();