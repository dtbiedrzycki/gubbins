import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsoleLogger } from './ConsoleLogger.js';

describe('ConsoleLogger', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['logInfo', 'log', 'info'],
    ['logWarn', 'warn', 'warn'],
    ['logError', 'error', 'error'],
  ] as const)('%s writes one JSON line at level %s', (method, consoleMethod, level) => {
    const spy = vi.spyOn(console, consoleMethod).mockImplementation(() => {});

    new ConsoleLogger()[method]('something_happened', { itemId: 'item-1' });

    expect(spy).toHaveBeenCalledOnce();
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toEqual({ level, message: 'something_happened', itemId: 'item-1' });
  });
});
