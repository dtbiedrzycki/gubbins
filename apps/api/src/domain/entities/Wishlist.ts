import { DomainValidationError, ItemNotFoundError } from '../errors.js';
import { GuestKey } from '../value-objects/GuestKey.js';
import { OwnerToken } from '../value-objects/OwnerToken.js';
import { Slug } from '../value-objects/Slug.js';
import { UuidId } from '../value-objects/UuidId.js';
import { Item } from './Item.js';

/**
 * Aggregate Root. `Item` is reachable only through the wishlist that owns it:
 * the wishlist is what authorizes a caller to act on an item, while the item
 * itself owns availability and hold-placing. Wishlist authorizes, Item
 * decides, Hold records.
 */
export class Wishlist {
  private _item: Item | null = null;

  /**
   * Enforces the aggregate's own invariants, so neither `create` nor
   * `reconstitute` can produce an invalid Wishlist. Trimming stays in
   * `create`, where the untrusted caller input arrives.
   */
  private constructor(
    readonly id: UuidId,
    readonly slug: Slug,
    readonly title: string,
    readonly ownerToken: OwnerToken,
    readonly key: GuestKey,
    readonly keyGen: number,
  ) {
    if (title.length === 0) throw new DomainValidationError('Wishlist title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Wishlist title must be at most 120 characters');
  }

  static create(props: { id: string; slug: string; title: string; ownerToken: string; key: string }): Wishlist {
    return new Wishlist(
      UuidId.from(props.id),
      Slug.from(props.slug),
      props.title.trim(),
      OwnerToken.from(props.ownerToken),
      GuestKey.from(props.key),
      1,
    );
  }

  /**
   * Reconstructs a Wishlist from persisted fields — used by repositories, not
   * by application-layer creation flows. `item` is the already-loaded item,
   * carrying its own concurrency state, which `create` cannot have yet.
   */
  static reconstitute(props: {
    id: string; slug: string; title: string; ownerToken: string; key: string; keyGen: number;
    item?: Item;
  }): Wishlist {
    if (props.item && props.item.wishlistId.value !== props.id) {
      throw new DomainValidationError('Item belongs to a different wishlist');
    }
    const wishlist = new Wishlist(
      UuidId.from(props.id),
      Slug.from(props.slug),
      props.title,
      OwnerToken.from(props.ownerToken),
      GuestKey.from(props.key),
      props.keyGen,
    );
    wishlist._item = props.item ?? null;
    return wishlist;
  }

  /**
   * Creates and attaches this wishlist's item, minting the item's id itself
   * via the supplied generator and assigning its own id as the item's
   * wishlistId — the caller supplies only the title a new item needs.
   * `ids` is taken as a structural type, not an imported interface:
   * domain/ may not import application/ (ADR-012); the application layer's
   * TokenGenerator already satisfies this shape.
   */
  addItem(props: { title: string }, ids: { generateId(): string }): Item {
    if (this._item !== null) {
      throw new DomainValidationError('Wishlist already has an item; this slice supports a single item per wishlist');
    }
    this._item = Item.createSingle({ id: ids.generateId(), wishlistId: this.id.value, title: props.title });
    return this._item;
  }

  get item(): Item | null {
    return this._item;
  }

  /**
   * Resolves `itemId` to the Item this wishlist owns, or throws
   * ItemNotFoundError. This is the aggregate's authorization step and the
   * only supported way to obtain a holdable Item: it returns the very
   * instance the aggregate tracks, so state the item records — a placed
   * hold — is visible through the wishlist afterwards.
   */
  getItem(itemId: string): Item {
    if (this._item === null || this._item.id.value !== itemId) {
      throw new ItemNotFoundError(itemId);
    }
    return this._item;
  }
}
