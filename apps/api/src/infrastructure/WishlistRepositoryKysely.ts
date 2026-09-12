import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import type { WishlistRepository } from '../application/ports/WishlistRepository.js';
import { Wishlist } from '../domain/entities/Wishlist.js';

export class WishlistRepositoryKysely implements WishlistRepository {
  constructor(private db: Kysely<Database>) {}

  async insert(wishlist: Wishlist): Promise<void> {
    await this.db.insertInto('wishlists').values({
      id: wishlist.id, slug: wishlist.slug, title: wishlist.title,
      owner_token: wishlist.ownerToken, key: wishlist.key, key_gen: wishlist.keyGen,
      created_at: new Date().toISOString(),
    }).execute();
  }

  async findBySlug(slug: string): Promise<Wishlist | null> {
    const row = await this.db.selectFrom('wishlists').selectAll().where('slug', '=', slug).executeTakeFirst();
    if (!row) return null;
    return Wishlist.reconstitute({
      id: row.id, slug: row.slug, title: row.title, ownerToken: row.owner_token, key: row.key, keyGen: row.key_gen,
    });
  }
}
