import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/support/setup.ts'],
    // Component tests sit beside the component they cover. Everything that
    // needs its own environment lives under test/ with its own config.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
