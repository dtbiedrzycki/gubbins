/** Carries only `piiRef`: the contributor's name and message live in `guest_pii`, never in the immutable log (ADR-0057). */
export interface ContributionPledgedEvent {
  type: 'ContributionPledged';
  v: 1;
  itemId: string;
  contributionId: string;
  amountMinor: number;
  sessionHash: string;
  idempotencyKey: string;
  piiRef: string;
  /** The owner_pii row of the handle the guest paid (ADR-0090). Optional: older events and pledges sent without a method lack it. */
  ownerPiiRef?: string;
  occurredAt: string; // ISO 8601
}
