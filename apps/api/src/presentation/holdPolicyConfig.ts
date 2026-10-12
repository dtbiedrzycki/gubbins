import { DEFAULT_HOLD_POLICY, type HoldPolicy } from '../application/HoldPolicy.js';

const WHOLE_DAYS = /^[1-9][0-9]*$/;

/**
 * HOLD_DURATION_DAYS (ops, default 3) validated into a HoldPolicy at the
 * composition root. A malformed value stops startup with a message naming
 * the variable, rather than minting holds that expire at NaN. Unset or empty
 * means the default: compose files commonly pass an unset variable through as ''.
 */
export function parseHoldPolicy(env: Record<string, string | undefined>): HoldPolicy {
  const raw = env.HOLD_DURATION_DAYS;
  if (raw === undefined || raw === '') return DEFAULT_HOLD_POLICY;
  if (!WHOLE_DAYS.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new Error(`HOLD_DURATION_DAYS must be a whole number of days, 1 or more (got ${JSON.stringify(raw)})`);
  }
  return { durationDays: Number(raw) };
}
