import { DomainValidationError, ItemAlreadyHeldError, ItemNotFoundError } from '../errors.js';
import { GuestKey } from '../value-objects/GuestKey.js';
import { OwnerToken } from '../value-objects/OwnerToken.js';
import { Slug } from '../value-objects/Slug.js';
import { WishlistId } from '../value-objects/WishlistId.js';
import { Item } from './Item.js';

/**
 * An item as held by the aggregate once loaded: the entity together with the
 * concurrency/availability state that used to be returned separately by the
 * repository. One shape, one load — not an item lookup plus a state lookup.
 */
export interface WishlistItemState {
  item: Item;
  seq: number;
  activeHolds: number;
  status: 'available' | 'held';
}

/**
 * Aggregate Root. `Item` is reachable only through the wishlist that owns it.
 */
export class Wishlist {
  private itemState: WishlistItemState | null = null;

  private constructor(
    readonly id: WishlistId,
    readonly slug: Slug,
    readonly title: string,
    readonly ownerToken: OwnerToken,
    readonly key: GuestKey,
    readonly keyGen: number,
  ) {}

  static create(props: { id: string; slug: string; title: string; ownerToken: string; key: string }): Wishlist {
    const title = props.title.trim();
    if (title.length === 0) throw new DomainValidationError('Wishlist title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Wishlist title must be at most 120 characters');
    return new Wishlist(
      WishlistId.from(props.id),
      Slug.from(props.slug),
      title,
      OwnerToken.from(props.ownerToken),
      GuestKey.from(props.key),
      1,
    );
  }

  /**
   * Reconstructs a Wishlist from persisted fields — used by repositories, not
   * by application-layer creation flows. `itemState` carries the already-loaded
   * item and its availability state, which `create` cannot have yet.
   */
  static reconstitute(props: {
    id: string; slug: string; title: string; ownerToken: string; key: string; keyGen: number;
    itemState?: WishlistItemState;
  }): Wishlist {
    if (props.itemState && props.itemState.item.wishlistId.value !== props.id) {
      throw new DomainValidationError('Item belongs to a different wishlist');
    }
    const wishlist = new Wishlist(
      WishlistId.from(props.id),
      Slug.from(props.slug),
      props.title,
      OwnerToken.from(props.ownerToken),
      GuestKey.from(props.key),
      props.keyGen,
    );
    wishlist.itemState = props.itemState ?? null;
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
    if (this.itemState !== null) {
      throw new DomainValidationError('Wishlist already has an item; this slice supports a single item per wishlist');
    }
    const item = Item.createSingle({ id: ids.generateId(), wishlistId: this.id.value, title: props.title });
    this.itemState = { item, seq: 0, activeHolds: 0, status: 'available' };
    return item;
  }

  get item(): Item | null {
    return this.itemState?.item ?? null;
  }

  /** The read shape the presentation layer renders, without a repository join. */
  toItemView(): { id: string; title: string; status: 'available' | 'held' } | null {
    if (this.itemState === null) return null;
    return this.itemState.item.toView(this.itemState.status);
  }

  /**
   * Resolves `itemId` to the Item this wishlist owns, or throws
   * ItemNotFoundError. `authorizeHold` checks this Item by reference
   * identity, so an Item obtained here (or via the `item` getter) is the
   * only thing that will satisfy it — a separately-constructed Item with a
   * matching id will not.
   */
  getItem(itemId: string): Item {
    if (this.itemState === null || this.itemState.item.id.value !== itemId) {
      throw new ItemNotFoundError(itemId);
    }
    return this.itemState.item;
  }

  /**
   * Decides whether a hold may be placed on `item`, purely from already-loaded
   * state — no I/O. Returns the seq the caller must use for its optimistic write.
   * Ownership is checked by reference identity (not just matching id), and
   * availability is read from the aggregate's own tracked item, never from
   * the caller-supplied `item` — the parameter only proves which item the
   * caller means to act on, it isn't a trusted source of that item's state.
   */
  authorizeHold(item: Item): { expectedSeq: number } {
    const state = this.itemState;
    if (state === null || state.item !== item) throw new ItemNotFoundError(item.id.value);
    if (state.activeHolds >= state.item.quantity) throw new ItemAlreadyHeldError(item.id.value);
    return { expectedSeq: state.seq };
  }
}
