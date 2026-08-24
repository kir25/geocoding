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
