/** Operator-configured hold rules, validated into this shape at the composition root. */
export interface HoldPolicy {
  /** HOLD_DURATION_DAYS (ops, default 3). The one extension adds the same again (ADR-0002). */
  durationDays: number;
}

export const DEFAULT_HOLD_POLICY: HoldPolicy = { durationDays: 3 };

const DAY_MS = 24 * 60 * 60 * 1000;

export function holdDurationMs(policy: HoldPolicy): number {
  return policy.durationDays * DAY_MS;
}
