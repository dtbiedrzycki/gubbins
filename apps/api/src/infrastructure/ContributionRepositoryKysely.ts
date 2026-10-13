import { sql, type Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import type { ContributionRepository } from '../application/ports/ContributionRepository.js';
import { Contribution } from '../domain/entities/Contribution.js';

export class ContributionRepositoryKysely implements ContributionRepository {
  constructor(private db: Kysely<Database>) {}

  async insert(c: Contribution): Promise<void> {
    await this.db.insertInto('contributions').values({
      id: c.id.value, item_id: c.itemId.value, amount_minor: c.amount.amountMinor, session_hash: c.sessionHash.value,
      idempotency_key: c.idempotencyKey.value, pii_ref: c.piiRef.value, pledged_at: c.pledgedAt.toISOString(),
      created_at: new Date().toISOString(),
    }).execute();
  }

  async findByIdempotencyKey(itemId: string, idempotencyKey: string): Promise<Contribution | null> {
    const row = await this.db.selectFrom('contributions').selectAll()
      .where('item_id', '=', itemId).where('idempotency_key', '=', idempotencyKey).executeTakeFirst();
    return row ? Contribution.reconstitute({
      id: row.id, itemId: row.item_id, amountMinor: row.amount_minor, sessionHash: row.session_hash,
      idempotencyKey: row.idempotency_key, piiRef: row.pii_ref, pledgedAt: new Date(row.pledged_at),
    }) : null;
  }

  async pledgedTotals(wishlistId: string): Promise<Map<string, number>> {
    const rows = await this.db.selectFrom('contributions')
      .innerJoin('items', 'items.id', 'contributions.item_id')
      .select(['contributions.item_id as item_id', sql<number>`sum(contributions.amount_minor)`.as('total')])
      .where('items.wishlist_id', '=', wishlistId)
      .groupBy('contributions.item_id')
      .execute();
    return new Map(rows.map((r) => [r.item_id, Number(r.total)]));
  }
}
