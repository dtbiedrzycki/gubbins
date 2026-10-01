import { Wishlist } from '../../domain/entities/Wishlist.js';
import { Item } from '../../domain/entities/Item.js';
import type { ItemHeldEvent } from '../../domain/events/ItemHeldEvent.js';

const DEFAULT_WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const DEFAULT_ITEM_ID = '33333333-3333-7333-8333-333333333333';

export class WishlistBuilder {
  private props = { id: DEFAULT_WISHLIST_ID, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' };
  private itemProps: { id: string; title: string } | null = null;

  withId(id: string): this { this.props.id = id; return this; }
  withSlug(slug: string): this { this.props.slug = slug; return this; }
  withTitle(title: string): this { this.props.title = title; return this; }
  withOwnerToken(ownerToken: string): this { this.props.ownerToken = ownerToken; return this; }
  withKey(key: string): this { this.props.key = key; return this; }
  /**
   * Attaches an item to the built aggregate — the wishlist assigns its own
   * id, so only `id`/`title` are needed here. Omit to build an itemless
   * wishlist.
   */
  withItem(props: { id: string; title: string }): this { this.itemProps = props; return this; }

  build(): Wishlist {
    const wishlist = Wishlist.create({ ...this.props });
    if (this.itemProps !== null) {
      const { id, title } = this.itemProps;
      wishlist.addItem({ title }, { generateEntityId: () => id });
    }
    return wishlist;
  }
}

export function aWishlist(): WishlistBuilder {
  return new WishlistBuilder();
}

export class ItemBuilder {
  private props = {
    id: DEFAULT_ITEM_ID, wishlistId: DEFAULT_WISHLIST_ID, type: 'single', title: 'Stroller', quantity: 1, seq: 0, activeHolds: 0,
  };

  withId(id: string): this { this.props.id = id; return this; }
  withWishlistId(wishlistId: string): this { this.props.wishlistId = wishlistId; return this; }
  withTitle(title: string): this { this.props.title = title; return this; }
  withType(type: string): this { this.props.type = type; return this; }
  withQuantity(quantity: number): this { this.props.quantity = quantity; return this; }
  withSeq(seq: number): this { this.props.seq = seq; return this; }
  withActiveHolds(activeHolds: number): this { this.props.activeHolds = activeHolds; return this; }

  build(): Item {
    return Item.reconstitute({ ...this.props });
  }
}

export function anItem(): ItemBuilder {
  return new ItemBuilder();
}

/** A well-formed ItemHeld payload for tests that need an event but not a hold. */
export function anItemHeldEvent(overrides: Partial<ItemHeldEvent> = {}): ItemHeldEvent {
  return {
    type: 'ItemHeld', v: 1, itemId: DEFAULT_ITEM_ID, holdId: '55555555-5555-7555-8555-555555555555',
    secretHash: 'f'.repeat(64), sessionHash: 'a'.repeat(64), idempotencyKey: 'idem-1',
    expiresAt: '2026-01-04T00:00:00.000Z', occurredAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
