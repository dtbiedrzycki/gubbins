import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import type { HoldRepository, HoldRecord } from '../application/ports/HoldRepository.js';

export class HoldRepositoryKysely implements HoldRepository {
  constructor(private db: Kysely<Database>) {}

  async recordHold(hold: HoldRecord): Promise<void> {
    await this.db.insertInto('holds').values({
      id: hold.id, item_id: hold.itemId, secret: hold.secret, session_hash: hold.sessionHash,
      idempotency_key: hold.idempotencyKey, expires_at: hold.expiresAt.toISOString(), created_at: new Date().toISOString(),
    }).execute();
  }

  async findByIdempotencyKey(itemId: string, idempotencyKey: string): Promise<HoldRecord | null> {
    const row = await this.db.selectFrom('holds').selectAll()
      .where('item_id', '=', itemId).where('idempotency_key', '=', idempotencyKey).executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id, itemId: row.item_id, secret: row.secret, sessionHash: row.session_hash,
      idempotencyKey: row.idempotency_key, expiresAt: new Date(row.expires_at),
    };
  }
}
