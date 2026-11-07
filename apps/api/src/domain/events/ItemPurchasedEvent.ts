/** A hold that ended in a purchase. Terminal (holds spec): only the owner can undo it, with PurchaseVoided in sub-project 4. */
export interface ItemPurchasedEvent {
  type: 'ItemPurchased';
  v: 1;
  holdId: string;
  units: number; // units bought, from 1 to the units held; the rest go back to other guests
  occurredAt: string; // ISO 8601 — folds into holds.purchased_at
}
