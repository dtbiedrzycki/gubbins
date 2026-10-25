import type { Kysely, Selectable } from 'kysely';
import type { ContributionsTable, Database } from './db/schema.js';
import type { ContributionRepository } from '../application/ports/ContributionRepository.js';
import { Contribution } from '../domain/entities/Contribution.js';

function toContribution(row: Selectable<ContributionsTable>): Contribution {
  return Contribution.reconstitute({
    id: row.id, itemId: row.item_id, amountMinor: row.amount_minor, sessionHash: row.session_hash,
    idempotencyKey: row.idempotency_key, piiRef: row.pii_ref, pledgedAt: new Date(row.pledged_at),
  });
}

export class ContributionRepositoryKysely implements ContributionRepository {
  constructor(private db: Kysely<Database>) {}

  async insert(c: Contribution): Promise<void> {
    await this.db.insertInto('contributions').values({
      id: c.id.value, item_id: c.itemId.value, amount_minor: c.amount.amountMinor, session_hash: c.sessionHash.value,
      idempotency_key: c.idempotencyKey.value, pii_ref: c.piiRef.value, pledged_at: c.pledgedAt.toISOString(),
      created_at: new Date().toISOString(),
    }).execute();
  }

  async findForWishlist(wishlistId: string): Promise<Contribution[]> {
    const rows = await this.db.selectFrom('contributions')
      .innerJoin('items', 'items.id', 'contributions.item_id')
      .selectAll('contributions')
      .where('items.wishlist_id', '=', wishlistId)
      .orderBy('contributions.pledged_at').orderBy('contributions.id')
      .execute();
    return rows.map(toContribution);
  }
}
