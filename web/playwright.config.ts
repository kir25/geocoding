import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-level tests against the real stack: React, the API and Postgres,
 * with nothing stubbed. The component tests cover behaviour with a mocked
 * client; these exist to catch what only appears when the pieces are wired
 * together — a broken asset path, a proxy misconfiguration, a response shape
 * the UI cannot read.
 *
 * Expects a migrated database with the sample fixture loaded:
 *   npm run db:migrate && npm run db:ingest -w geocoding-server -- --sample
 */
const API_PORT = 3000;
const WEB_PORT = 5173;

export default defineConfig({
  testDir: './e2e',
  // A failure here is a real regression, not flake to be retried away — but CI
  // runners are noisy enough that one retry saves re-running the whole job.
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Playwright owns both processes so a run is one command. The dev server is
  // used rather than a preview build because its proxy is what keeps the
  // browser on a single origin — the same path a developer exercises.
  webServer: [
    {
      command: 'npm run start -w geocoding-server',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      cwd: '..',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w geocoding-web',
      url: `http://localhost:${WEB_PORT}`,
      cwd: '..',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
