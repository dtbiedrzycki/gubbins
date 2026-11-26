import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import type { OwnerPiiRepository } from '../application/ports/OwnerPiiRepository.js';
import { PaymentHandle } from '../domain/value-objects/PaymentHandle.js';

export class OwnerPiiRepositoryKysely implements OwnerPiiRepository {
  constructor(private db: Kysely<Database>) {}

  async insert(id: string, wishlistId: string, payment: PaymentHandle): Promise<void> {
    await this.db.insertInto('owner_pii')
      .values({ id, wishlist_id: wishlistId, method: payment.method, handle: payment.handle, redacted_at: null, created_at: new Date().toISOString() })
      .execute();
  }

  async findByIds(ids: readonly string[]): Promise<Map<string, PaymentHandle>> {
    const rows = await this.db.selectFrom('owner_pii').select(['id', 'method', 'handle']).where('id', 'in', ids).execute();
    return new Map(rows.map((row) => [row.id, PaymentHandle.from(row.method, row.handle)]));
  }
}
