import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { requestLog } from './handlers';
import { server } from './msw';

// `error` rather than `warn`: an unhandled request means the client called a
// URL nobody expected, which is the kind of drift these tests exist to catch.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  server.resetHandlers();
  requestLog.length = 0;
  cleanup();
});

afterAll(() => server.close());
