import type { Logger } from '../application/ports/Logger.js';

/**
 * Reports the error that stopped the server from starting. It goes through
 * the logger when there is one. If the failure happened before the logger
 * was built, or the logger itself throws, it falls back to the console, so
 * the error is never lost.
 */
export function reportStartupFailure(err: unknown, logger: Logger | undefined): void {
  if (logger) {
    try {
      logger.logError('startup_failed', err instanceof Error ? { error: err.message, stack: err.stack } : { error: String(err) });
      return;
    } catch (loggerErr) {
      console.error('Logger failed while reporting a startup failure:', loggerErr);
    }
  }
  console.error(err);
}
