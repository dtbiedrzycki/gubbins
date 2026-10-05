/** A hold given up before it expired. Who released it is the envelope's `actor`, not a payload field (ADR-0075). */
export interface HoldReleasedEvent {
  type: 'HoldReleased';
  v: 1;
  holdId: string;
  occurredAt: string; // ISO 8601 — folds into holds.released_at
}
