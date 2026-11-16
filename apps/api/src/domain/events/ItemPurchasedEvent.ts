/** A hold that ended in a purchase. The guest who bought it can undo it with `BuyUndone`. */
export interface ItemPurchasedEvent {
  type: 'ItemPurchased';
  v: 1;
  holdId: string;
  units: number; // units bought, from 1 to the units held; the rest go back to other guests
  occurredAt: string; // ISO 8601 — folds into holds.purchased_at
}
