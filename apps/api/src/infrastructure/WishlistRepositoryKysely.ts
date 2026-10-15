import type { Kysely, Selectable } from 'kysely';
import type { Database, WishlistsTable } from './db/schema.js';
import type { WishlistRepository } from '../application/ports/WishlistRepository.js';
import { Wishlist } from '../domain/entities/Wishlist.js';
import { PaymentMethods } from '../domain/value-objects/PaymentMethods.js';
import { WishlistNotFoundError } from '../domain/errors.js';
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
      venmo_handle: wishlist.paymentMethods.venmoHandle, zelle_handle: wishlist.paymentMethods.zelleHandle,
      created_at: new Date().toISOString(),
    }).execute();
    for (const item of wishlist.items) await this.items.insert(item);
  }

  async findBySlug(slug: string, now: Date): Promise<Wishlist | null> {
    const row = await this.db.selectFrom('wishlists').selectAll().where('slug', '=', slug).executeTakeFirst();
    return row ? this.hydrate(row, now) : null;
  }

  async findById(id: string, now: Date): Promise<Wishlist | null> {
    const row = await this.db.selectFrom('wishlists').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? this.hydrate(row, now) : null;
  }

  async save(wishlist: Wishlist): Promise<void> {
    const list = await this.db.selectFrom('wishlists').select('id').where('id', '=', wishlist.id.value).executeTakeFirst();
    if (list === undefined) throw new WishlistNotFoundError(wishlist.id.value);
    const storedSeq = new Map((await this.items.findAllByWishlistId(wishlist.id.value)).map((item) => [item.id.value, item.seq]));
    // Writes only items the domain added or moved on, so an untouched row keeps its updated_at.
    for (const item of wishlist.items) {
      const seq = storedSeq.get(item.id.value);
      if (seq === undefined) await this.items.insert(item);
      else if (seq !== item.seq) await this.items.saveState(item);
    }
    // After the items, so a new hold's item row already exists.
    const holdIds = wishlist.holds.map((hold) => hold.id.value);
    const storedHolds = holdIds.length === 0 ? new Set<string>()
      : new Set((await this.db.selectFrom('holds').select('id').where('id', 'in', holdIds).execute()).map((row) => row.id));
    for (const hold of wishlist.holds) {
      if (storedHolds.has(hold.id.value)) await this.holds.save(hold);
      else await this.holds.insert(hold);
    }
  }

  /**
   * Active and purchased holds only, so the aggregate stays bounded however
   * long the list has been in use. `now` is both the hold query's instant and
   * the aggregate's `asOf`, so load and decision share it.
   */
  private async hydrate(row: Selectable<WishlistsTable>, now: Date): Promise<Wishlist> {
    const items = await this.items.findAllByWishlistId(row.id);
    const holds = await this.holds.findActiveOrPurchasedForWishlist(row.id, now);
    return Wishlist.reconstitute({
      id: row.id, slug: row.slug, title: row.title,
      ownerToken: row.owner_token, key: row.key, keyGen: row.key_gen, asOf: now,
      paymentMethods: PaymentMethods.from({ venmoHandle: row.venmo_handle, zelleHandle: row.zelle_handle }),
      items, holds,
    });
  }
}
