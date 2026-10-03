import { ConcurrencyError } from '../domain/errors.js';
import type { TransactionContext, UnitOfWork } from './ports/UnitOfWork.js';

export interface RetryOptions {
  /** Retries after the first attempt. Capped at 3. */
  retries: number;
  /** Waits before a retry; injected so tests need not sleep. */
  sleep(ms: number): Promise<void>;
  /** Jitter source in [0, 1). */
  random(): number;
}

const DEFAULT_OPTIONS: RetryOptions = {
  retries: 3,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
};

/**
 * Re-runs a whole unit of work when it loses an optimistic-concurrency race
 * (data & persistence: "losing writer retries against fresh state and
 * re-evaluates the policy. Retry cap 3 with jitter."). The callback runs
 * again from the top, so it reloads the aggregate and decides afresh — a
 * retry never replays a stale decision. Any other failure passes straight
 * through.
 *
 * Under BEGIN IMMEDIATE on one connection a conflict should not arise at
 * all; this guards the case where one does (another process on the file).
 */
export class RetryingUnitOfWork implements UnitOfWork {
  constructor(
    private inner: UnitOfWork,
    private options: RetryOptions = DEFAULT_OPTIONS,
  ) {}

  async execute<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.inner.execute(fn);
      } catch (err) {
        if (!(err instanceof ConcurrencyError) || attempt >= this.options.retries) throw err;
        // Full jitter over a doubling window: up to 10, 20, then 40 ms.
        await this.options.sleep(Math.floor(this.options.random() * 10 * 2 ** attempt));
      }
    }
  }
}
