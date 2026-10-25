import type { Kysely, Selectable } from 'kysely';
import type { Database, WishlistsTable } from './db/schema.js';
import type { WishlistRepository } from '../application/ports/WishlistRepository.js';
import { Item } from '../domain/entities/Item.js';
import { Wishlist } from '../domain/entities/Wishlist.js';
import { PaymentMethods } from '../domain/value-objects/PaymentMethods.js';
import { WishlistNotFoundError } from '../domain/errors.js';
import { ContributionRepositoryKysely } from './ContributionRepositoryKysely.js';
import { HoldRepositoryKysely, lifecycleColumns } from './HoldRepositoryKysely.js';
import { ItemRepositoryKysely } from './ItemRepositoryKysely.js';

/**
 * The aggregate's SQLite adapter (ADR-0078). Its item, hold and
 * contribution collaborators are built on the *same* Kysely/transaction instance, so
 * everything it reads and writes takes part in the caller's transaction.
 */
export class WishlistRepositoryKysely implements WishlistRepository {
  private items: ItemRepositoryKysely;
  private holds: HoldRepositoryKysely;
  private contributions: ContributionRepositoryKysely;

  constructor(private db: Kysely<Database>) {
    this.items = new ItemRepositoryKysely(db);
    this.holds = new HoldRepositoryKysely(db);
    this.contributions = new ContributionRepositoryKysely(db);
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
    const storedSeq = await this.items.seqsByWishlistId(wishlist.id.value);
    // Writes only items the domain added or moved on, so an untouched row keeps its updated_at.
    for (const item of wishlist.items) {
      const seq = storedSeq.get(item.id.value);
      if (seq === undefined) await this.items.insert(item);
      else if (seq !== item.seq) await this.items.saveState(item);
    }
    // After the items, so a new hold's item row already exists.
    const holdIds = wishlist.holds.map((hold) => hold.id.value);
    const storedRows = holdIds.length === 0 ? [] : await this.db.selectFrom('holds')
      .select(['id', 'expires_at', 'extended_at', 'released_at', 'purchased_at']).where('id', 'in', holdIds).execute();
    const storedHolds = new Map(storedRows.map(({ id, ...lifecycle }) => [id, lifecycle]));
    // Likewise only holds the domain placed or changed; every column save writes is compared.
    for (const hold of wishlist.holds) {
      const stored = storedHolds.get(hold.id.value);
      const columns = lifecycleColumns(hold);
      if (stored === undefined) await this.holds.insert(hold);
      else if ((Object.keys(columns) as (keyof typeof columns)[]).some((column) => stored[column] !== columns[column])) await this.holds.save(hold);
    }
    // After the items, so a new contribution's item row already exists. Pledges are never updated, only added.
    const contributionIds = wishlist.contributions.map((c) => c.id.value);
    const storedContributions = contributionIds.length === 0 ? new Set<string>()
      : new Set((await this.db.selectFrom('contributions').select('id').where('id', 'in', contributionIds).execute()).map((row) => row.id));
    for (const contribution of wishlist.contributions) {
      if (!storedContributions.has(contribution.id.value)) await this.contributions.insert(contribution);
    }
  }

  /**
   * Every item on the list, each with all its holds and contributions
   * (ADR-0078). `now` is the aggregate's `asOf`, the one instant it decides at.
   */
  private async hydrate(row: Selectable<WishlistsTable>, now: Date): Promise<Wishlist> {
    const holds = await this.holds.findForWishlist(row.id);
    const contributions = await this.contributions.findForWishlist(row.id);
    const items = (await this.items.findAllByWishlistId(row.id)).map((item) => Item.reconstitute({
      ...item, asOf: now,
      // The members arrive for the whole list; each item takes only its own.
      holds: holds.filter((hold) => hold.itemId.value === item.id),
      contributions: contributions.filter((contribution) => contribution.itemId.value === item.id),
    }));
    return Wishlist.reconstitute({
      id: row.id, slug: row.slug, title: row.title,
      ownerToken: row.owner_token, key: row.key, keyGen: row.key_gen, asOf: now,
      paymentMethods: PaymentMethods.from({ venmoHandle: row.venmo_handle, zelleHandle: row.zelle_handle }),
      items,
    });
  }
}
