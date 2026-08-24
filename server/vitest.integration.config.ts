import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vitest transforms with esbuild, which does not emit decorator metadata, so
  // Nest cannot resolve constructor parameter types and every injected
  // dependency arrives undefined. SWC emits it; this is the only reason the
  // plugin is here.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/integration/**/*.spec.ts'],
    // Nest bootstraps a DI container and a pg pool per file; the default 5s is
    // tight on a cold CI runner.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // One database, shared fixture state — run the files serially.
    fileParallelism: false,
  },
});
