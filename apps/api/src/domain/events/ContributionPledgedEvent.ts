/** Carries only `piiRef`: the holder's name and message live in `guest_pii`, never in the immutable log (ADR-0057). */
export interface ContributionPledgedEvent {
  type: 'ContributionPledged';
  v: 1;
  itemId: string;
  contributionId: string;
  amountMinor: number;
  sessionHash: string;
  idempotencyKey: string;
  piiRef: string;
  occurredAt: string; // ISO 8601
}
