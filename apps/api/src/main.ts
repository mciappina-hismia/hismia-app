import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const DEFAULT_PORT = 3001;
const port = Number.parseInt(process.env.PORT ?? `${DEFAULT_PORT}`, 10);

async function bootstrap(): Promise<void> {
  const nestApp = await NestFactory.create(AppModule);
  await nestApp.listen(port);
  console.info(`Hismia API listening on port ${port}`);
}

void bootstrap();