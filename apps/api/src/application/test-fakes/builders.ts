import { Wishlist } from '../../domain/entities/Wishlist.js';
import { Item } from '../../domain/entities/Item.js';

export class WishlistBuilder {
  private props = { id: 'w1', slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' };
  private item: Item | null = null;

  withId(id: string): this { this.props.id = id; return this; }
  withSlug(slug: string): this { this.props.slug = slug; return this; }
  withTitle(title: string): this { this.props.title = title; return this; }
  withOwnerToken(ownerToken: string): this { this.props.ownerToken = ownerToken; return this; }
  withKey(key: string): this { this.props.key = key; return this; }
  /** Attaches the item to the built aggregate; omit it to build an itemless wishlist. */
  withItem(item: Item): this { this.item = item; return this; }

  build(): Wishlist {
    const wishlist = Wishlist.create({ ...this.props });
    if (this.item !== null) wishlist.addItem(this.item);
    return wishlist;
  }
}

export function aWishlist(): WishlistBuilder {
  return new WishlistBuilder();
}

export class ItemBuilder {
  private props = { id: 'item-1', wishlistId: 'w1', title: 'Stroller' };

  withId(id: string): this { this.props.id = id; return this; }
  withWishlistId(wishlistId: string): this { this.props.wishlistId = wishlistId; return this; }
  withTitle(title: string): this { this.props.title = title; return this; }

  build(): Item {
    return Item.createSingle({ ...this.props });
  }
}

export function anItem(): ItemBuilder {
  return new ItemBuilder();
}
