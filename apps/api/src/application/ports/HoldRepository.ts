export interface HoldRecord {
  id: string;
  itemId: string;
  secret: string;
  sessionHash: string;
  idempotencyKey: string;
  expiresAt: Date;
}

export interface HoldRepository {
  recordHold(hold: HoldRecord): Promise<void>;
  findByIdempotencyKey(itemId: string, idempotencyKey: string): Promise<HoldRecord | null>;
}
