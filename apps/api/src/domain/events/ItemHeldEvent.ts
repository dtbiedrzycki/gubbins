export interface ItemHeldEvent {
  type: 'ItemHeld';
  itemId: string;
  holdId: string;
  secret: string;
  sessionHash: string;
  idempotencyKey: string;
  expiresAt: string; // ISO 8601
  occurredAt: string; // ISO 8601
}
