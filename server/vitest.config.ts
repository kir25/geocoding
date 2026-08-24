import { defineConfig } from 'vitest/config';

/**
 * Unit tests run everywhere with no dependencies. The e2e suite needs a
 * migrated database with the sample fixture loaded, so it is a separate
 * command rather than something that fails confusingly on a clean checkout.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts'],
    exclude: ['test/**'],
  },
});
