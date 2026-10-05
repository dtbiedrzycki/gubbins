/** A hold's one extension (ADR-0002). `expiresAt` is the new expiry, already including the added duration. */
export interface HoldExtendedEvent {
  type: 'HoldExtended';
  v: 1;
  holdId: string;
  expiresAt: string; // ISO 8601
  occurredAt: string; // ISO 8601 — folds into holds.extended_at
}
