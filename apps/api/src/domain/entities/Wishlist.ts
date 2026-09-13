import { DomainValidationError, ItemAlreadyHeldError, ItemNotFoundError } from '../errors.js';
import { GuestKey } from '../value-objects/GuestKey.js';
import { OwnerToken } from '../value-objects/OwnerToken.js';
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
    readonly id: string,
    readonly slug: string,
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
      props.id,
      props.slug,
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
    const wishlist = new Wishlist(
      props.id,
      props.slug,
      props.title,
      OwnerToken.from(props.ownerToken),
      GuestKey.from(props.key),
      props.keyGen,
    );
    wishlist.itemState = props.itemState ?? null;
    return wishlist;
  }

  /** Attaches the wishlist's item. This slice allows exactly one item per wishlist. */
  addItem(item: Item): void {
    if (this.itemState !== null) {
      throw new DomainValidationError('Wishlist already has an item; this slice supports a single item per wishlist');
    }
    this.itemState = { item, seq: 0, activeHolds: 0, status: 'available' };
  }

  get item(): Item | null {
    return this.itemState?.item ?? null;
  }

  /** The read shape the presentation layer renders, without a repository join. */
  get itemView(): { id: string; title: string; status: 'available' | 'held' } | null {
    if (this.itemState === null) return null;
    return { id: this.itemState.item.id, title: this.itemState.item.title, status: this.itemState.status };
  }

  /**
   * Decides whether a hold may be placed on `itemId`, purely from already-loaded
   * state — no I/O. Returns the seq the caller must use for its optimistic write.
   */
  authorizeHold(itemId: string): { expectedSeq: number } {
    const state = this.itemState;
    if (state === null || state.item.id !== itemId) throw new ItemNotFoundError(itemId);
    if (state.activeHolds >= state.item.quantity) throw new ItemAlreadyHeldError(itemId);
    return { expectedSeq: state.seq };
  }
}
