import { DomainValidationError } from '../errors.js';
import { ItemId } from '../value-objects/ItemId.js';
import { WishlistId } from '../value-objects/WishlistId.js';

export class Item {
  /**
   * Enforces the entity's invariants, so no construction path — factory or
   * reconstitution from persisted rows — can produce an invalid Item.
   * Input normalization (trimming) belongs to the factories, not here: it
   * cleans what a caller supplied, whereas these checks state what an Item
   * *is*.
   */
  private constructor(
    readonly id: ItemId,
    readonly wishlistId: WishlistId,
    readonly type: 'single',
    readonly title: string,
    readonly quantity: number,
  ) {
    if (title.length === 0) throw new DomainValidationError('Item title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Item title must be at most 120 characters');
  }

  static createSingle(props: { id: string; wishlistId: string; title: string }): Item {
    return new Item(ItemId.from(props.id), WishlistId.from(props.wishlistId), 'single', props.title.trim(), 1);
  }

  /** Reconstructs an Item from persisted fields. */
  static reconstitute(props: { id: string; wishlistId: string; title: string }): Item {
    return new Item(ItemId.from(props.id), WishlistId.from(props.wishlistId), 'single', props.title, 1);
  }

  /**
   * The read shape the presentation layer renders. `status` is supplied by
   * the caller rather than owned by Item itself — it's aggregate/projection
   * state (activeHolds vs. quantity), not one of this entity's own fields.
   */
  toView(status: 'available' | 'held'): { id: string; title: string; status: 'available' | 'held' } {
    return { id: this.id.value, title: this.title, status };
  }
}
