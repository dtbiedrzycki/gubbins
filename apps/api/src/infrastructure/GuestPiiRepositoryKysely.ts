import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import type { GuestPiiRepository } from '../application/ports/GuestPiiRepository.js';
import { GuestDetails } from '../domain/value-objects/GuestDetails.js';

export class GuestPiiRepositoryKysely implements GuestPiiRepository {
  constructor(private db: Kysely<Database>) {}

  async insert(id: string, details: GuestDetails): Promise<void> {
    await this.db.insertInto('guest_pii')
      .values({ id, name: details.name, message: details.message, redacted_at: null, created_at: new Date().toISOString() })
      .execute();
  }

  async findById(id: string): Promise<GuestDetails | null> {
    const row = await this.db.selectFrom('guest_pii').select(['name', 'message']).where('id', '=', id).executeTakeFirst();
    return row ? GuestDetails.from(row) : null;
  }
}
