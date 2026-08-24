import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Loads the repo-root .env for standalone scripts. The Nest app gets this from
 * ConfigModule; scripts run outside the DI container, so they read it directly.
 */
export function loadEnv(): void {
  const path = join(__dirname, '..', '..', '.env');
  if (!existsSync(path)) {
    throw new Error('.env not found — copy .env.example to .env first');
  }

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] === undefined) {
      process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
}

/**
 * Waits for Postgres to accept a real query.
 *
 * `docker compose up -d` returns as soon as the container starts, but the
 * official image runs initdb against a temporary server first — so a health
 * check can report ready while the real server is still coming up. Without
 * this, `npm run db:reset` straight after `docker compose up -d` fails
 * intermittently on a cold volume.
 */
export async function waitForDatabase(
  pool: { query: (sql: string) => Promise<unknown> },
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: Error | null = null;
  let announced = false;

  while (Date.now() < deadline) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      lastError = err as Error;
      if (!announced) {
        console.log('  waiting for postgres…');
        announced = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(
    `database not reachable after ${timeoutMs / 1000}s: ${lastError?.message}`,
  );
}
