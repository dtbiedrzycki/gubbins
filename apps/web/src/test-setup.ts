import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './test/msw/server';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  // Remembered choices, like the gifter names, must not carry into the next test.
  globalThis.localStorage?.clear(); // absent in node-environment tests
});
afterAll(() => server.close());
