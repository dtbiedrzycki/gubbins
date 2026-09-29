import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../application/ports/Logger.js';
import { reportStartupFailure } from './reportStartupFailure.js';

function recordingLogger(): Logger & { errors: unknown[][] } {
  const errors: unknown[][] = [];
  return { errors, logInfo: () => {}, logWarn: () => {}, logError: (...args) => { errors.push(args); } };
}

describe('reportStartupFailure', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reports through the logger when one was built', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = recordingLogger();

    reportStartupFailure(new Error('migration failed'), logger);

    expect(logger.errors).toEqual([['startup_failed', expect.objectContaining({ error: 'migration failed' })]]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('falls back to the console when no logger was built', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('could not build logger');

    reportStartupFailure(err, undefined);

    expect(consoleError).toHaveBeenCalledWith(err);
  });

  it('falls back to the console when the logger itself throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('migration failed');
    const broken: Logger = { logInfo: () => {}, logWarn: () => {}, logError: () => { throw new Error('transport down'); } };

    reportStartupFailure(err, broken);

    expect(consoleError).toHaveBeenCalledWith(err);
  });
});
