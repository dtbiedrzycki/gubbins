import { describe, expect, it } from 'vitest';
import { RetryingUnitOfWork, type RetryOptions } from './RetryingUnitOfWork.js';
import type { TransactionContext, UnitOfWork } from './ports/UnitOfWork.js';
import { ConcurrencyError } from '../domain/errors.js';

/** A unit of work that fails with each given error in turn, then runs the callback. */
function failingThen(errors: Error[]) {
  let calls = 0;
  const unitOfWork: UnitOfWork = {
    execute: async (fn) => {
      const error = errors[calls];
      calls += 1;
      if (error) throw error;
      return fn({} as TransactionContext);
    },
  };
  return { unitOfWork, calls: () => calls };
}

const conflict = () => new ConcurrencyError('item-1', 0, 1);

function instant(sleeps: number[]): RetryOptions {
  return { retries: 3, sleep: async (ms) => { sleeps.push(ms); }, random: () => 0.5 };
}

describe('RetryingUnitOfWork (data & persistence: retry cap 3 with jitter)', () => {
  it('runs the unit of work once when it succeeds', async () => {
    const { unitOfWork, calls } = failingThen([]);
    await expect(new RetryingUnitOfWork(unitOfWork, instant([])).execute(async () => 'done')).resolves.toBe('done');
    expect(calls()).toBe(1);
  });

  it('re-runs the whole unit of work after a conflict, waiting a jittered, doubling interval', async () => {
    const sleeps: number[] = [];
    const { unitOfWork, calls } = failingThen([conflict(), conflict()]);

    await expect(new RetryingUnitOfWork(unitOfWork, instant(sleeps)).execute(async () => 'done')).resolves.toBe('done');

    expect(calls()).toBe(3);
    expect(sleeps).toEqual([5, 10]);
  });

  it('gives up after 3 retries and rethrows the conflict', async () => {
    const sleeps: number[] = [];
    const { unitOfWork, calls } = failingThen([conflict(), conflict(), conflict(), conflict()]);

    await expect(new RetryingUnitOfWork(unitOfWork, instant(sleeps)).execute(async () => 'done')).rejects.toThrow(ConcurrencyError);

    expect(calls()).toBe(4);
    expect(sleeps).toEqual([5, 10, 20]);
  });

  it('never retries any other failure', async () => {
    const { unitOfWork, calls } = failingThen([new Error('boom')]);
    await expect(new RetryingUnitOfWork(unitOfWork, instant([])).execute(async () => 'done')).rejects.toThrow('boom');
    expect(calls()).toBe(1);
  });
});
