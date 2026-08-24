import { createApp } from './app.factory';

async function bootstrap() {
  const app = await createApp();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`geocoding-server listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
