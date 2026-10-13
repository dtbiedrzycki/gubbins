import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import type { GuestPiiRecord, GuestPiiRepository } from '../application/ports/GuestPiiRepository.js';

export class GuestPiiRepositoryKysely implements GuestPiiRepository {
  constructor(private db: Kysely<Database>) {}

  async insert(record: GuestPiiRecord): Promise<void> {
    await this.db.insertInto('guest_pii').values({ ...record, redacted_at: null, created_at: new Date().toISOString() }).execute();
  }

  async findById(id: string): Promise<GuestPiiRecord | null> {
    const row = await this.db.selectFrom('guest_pii').select(['id', 'name', 'message']).where('id', '=', id).executeTakeFirst();
    return row ?? null;
  }
}
