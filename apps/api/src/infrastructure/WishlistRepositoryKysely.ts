import type { Kysely, Selectable } from 'kysely';
import type { Database, WishlistsTable } from './db/schema.js';
import type { WishlistRepository } from '../application/ports/WishlistRepository.js';
import { Wishlist } from '../domain/entities/Wishlist.js';
import { ItemNotFoundError } from '../domain/errors.js';
import { ItemRepositoryKysely } from './ItemRepositoryKysely.js';

/**
 * The aggregate's SQLite adapter. It owns an `ItemRepositoryKysely` built on
 * the *same* `Kysely`/transaction instance, so the item and item_state rows it
 * reads and writes take part in the caller's transaction. That collaborator is
 * private: `ItemRepository` is an implementation detail of this repository,
 * never a use-case-facing port.
 */
export class WishlistRepositoryKysely implements WishlistRepository {
  private items: ItemRepositoryKysely;

  constructor(private db: Kysely<Database>) {
    this.items = new ItemRepositoryKysely(db);
  }

  async insert(wishlist: Wishlist): Promise<void> {
    await this.db.insertInto('wishlists').values({
      id: wishlist.id.value, slug: wishlist.slug.value, title: wishlist.title,
      owner_token: wishlist.ownerToken.value, key: wishlist.key.value, key_gen: wishlist.keyGen,
      created_at: new Date().toISOString(),
    }).execute();
    const item = wishlist.item;
    if (item !== null) await this.items.insert(item);
  }

  async findBySlug(slug: string): Promise<Wishlist | null> {
    const row = await this.db.selectFrom('wishlists').selectAll().where('slug', '=', slug).executeTakeFirst();
    return row ? this.hydrate(row) : null;
  }

  async findById(id: string): Promise<Wishlist | null> {
    const row = await this.db.selectFrom('wishlists').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? this.hydrate(row) : null;
  }

  async markItemHeld(wishlistId: string, itemId: string, newSeq: number): Promise<void> {
    const item = await this.items.findInWishlist(wishlistId, itemId);
    if (!item) throw new ItemNotFoundError(itemId);
    await this.items.markHeld(itemId, newSeq);
  }

  /** Loads the whole aggregate for an already-fetched wishlist row. */
  private async hydrate(row: Selectable<WishlistsTable>): Promise<Wishlist> {
    const item = await this.items.findByWishlistId(row.id);
    return Wishlist.reconstitute({
      id: row.id, slug: row.slug, title: row.title,
      ownerToken: row.owner_token, key: row.key, keyGen: row.key_gen,
      item: item ?? undefined,
    });
  }
}
