/** A guest took back their buy. Who undid it is the envelope's `actor`, not a payload field (ADR-0075). */
export interface BuyUndoneEvent {
  type: 'BuyUndone';
  v: 1;
  holdId: string;
  occurredAt: string; // ISO 8601 — folds into holds.buy_undone_at
}
