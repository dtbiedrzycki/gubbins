/** A hold that ended in a purchase. Terminal (holds spec): only the owner can undo it, with PurchaseVoided in sub-project 4. */
export interface ItemPurchasedEvent {
  type: 'ItemPurchased';
  v: 1;
  holdId: string;
  occurredAt: string; // ISO 8601 — folds into holds.purchased_at and item_state.purchased_count
}
