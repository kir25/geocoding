import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * UI integration: the real component tree over the real API client and real
 * fetch, with MSW intercepting at the network boundary.
 *
 * The component suite mocks src/api/client entirely, which leaves URL
 * construction, query encoding, response parsing and HTTP error handling
 * untested. These run that code for real against the API's actual contract.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    // happy-dom rather than jsdom: jsdom ships its own AbortController, and
    // Node's fetch validates the signal with an instanceof check against its
    // own class, so every aborted-capable request throws "Expected signal to be
    // an instance of AbortSignal". The client's use of AbortSignal is correct;
    // it is jsdom that cannot be paired with Node's fetch here.
    environment: 'happy-dom',
    globals: true,
    // The client defaults to a relative /api/v1, which the browser resolves
    // against the page origin. Under jsdom the global fetch is Node's, and it
    // rejects relative URLs outright — so the base is made absolute here rather
    // than changing the app to suit the test environment.
    env: { VITE_API_BASE: 'http://localhost:3000/api/v1' },
    setupFiles: ['./src/test/setup-integration.ts'],
    include: ['src/**/*.integration.test.ts', 'src/**/*.integration.test.tsx'],
  },
});
