import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

/**
 * Builds the application with the configuration that ships.
 *
 * main.ts and the e2e tests both go through here, so the tests exercise the
 * real global prefix and the real validation pipe rather than a lookalike that
 * can drift from production.
 */
export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { logger: ['error', 'warn'] },
  );

  app.setGlobalPrefix('api/v1');
  app.enableCors();

  // Query params arrive as strings; `transform` coerces them to the DTO types.
  // `forbidNonWhitelisted` rejects unknown params rather than ignoring them.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  return app;
}
