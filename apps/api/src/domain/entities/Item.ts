import { DomainValidationError } from '../errors.js';

export class Item {
  private constructor(
    readonly id: string,
    readonly wishlistId: string,
    readonly type: 'single',
    readonly title: string,
    readonly quantity: number,
  ) {}

  static createSingle(props: { id: string; wishlistId: string; title: string }): Item {
    const title = props.title.trim();
    if (title.length === 0) throw new DomainValidationError('Item title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Item title must be at most 120 characters');
    return new Item(props.id, props.wishlistId, 'single', title, 1);
  }

  /** Reconstructs an Item from persisted fields. */
  static reconstitute(props: { id: string; wishlistId: string; title: string }): Item {
    return new Item(props.id, props.wishlistId, 'single', props.title, 1);
  }
}
