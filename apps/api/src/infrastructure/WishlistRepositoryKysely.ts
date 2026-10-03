import type { Kysely, Selectable } from 'kysely';
import type { Database, WishlistsTable } from './db/schema.js';
import type { WishlistRepository } from '../application/ports/WishlistRepository.js';
import type { Item } from '../domain/entities/Item.js';
import { Wishlist } from '../domain/entities/Wishlist.js';
import { HoldRepositoryKysely } from './HoldRepositoryKysely.js';
import { ItemRepositoryKysely } from './ItemRepositoryKysely.js';

/**
 * The aggregate's SQLite adapter (ADR-0078). Its item and hold
 * collaborators are built on the *same* Kysely/transaction instance, so
 * everything it reads and writes takes part in the caller's transaction.
 */
export class WishlistRepositoryKysely implements WishlistRepository {
  private items: ItemRepositoryKysely;
  private holds: HoldRepositoryKysely;

  constructor(private db: Kysely<Database>) {
    this.items = new ItemRepositoryKysely(db);
    this.holds = new HoldRepositoryKysely(db);
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

  async findBySlug(slug: string, now: Date): Promise<Wishlist | null> {
    const row = await this.db.selectFrom('wishlists').selectAll().where('slug', '=', slug).executeTakeFirst();
    return row ? this.hydrate(row, now) : null;
  }

  async findById(id: string, now: Date): Promise<Wishlist | null> {
    const row = await this.db.selectFrom('wishlists').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? this.hydrate(row, now) : null;
  }

  async saveItemState(item: Item): Promise<void> {
    await this.items.saveState(item);
  }

  /**
   * Active holds only, so the aggregate stays bounded however long the list
   * has been in use. `now` is both the active-hold query's instant and the
   * aggregate's `asOf`, so load and decision share it.
   */
  private async hydrate(row: Selectable<WishlistsTable>, now: Date): Promise<Wishlist> {
    const item = await this.items.findByWishlistId(row.id);
    const activeHolds = await this.holds.findActiveForWishlist(row.id, now);
    return Wishlist.reconstitute({
      id: row.id, slug: row.slug, title: row.title,
      ownerToken: row.owner_token, key: row.key, keyGen: row.key_gen, asOf: now,
      item: item ?? undefined, activeHolds,
    });
  }
}
