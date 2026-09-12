import { DomainValidationError } from '../errors.js';

export class Wishlist {
  private constructor(
    readonly id: string,
    readonly slug: string,
    readonly title: string,
    readonly ownerToken: string,
    readonly key: string,
    readonly keyGen: number,
  ) {}

  static create(props: { id: string; slug: string; title: string; ownerToken: string; key: string }): Wishlist {
    const title = props.title.trim();
    if (title.length === 0) throw new DomainValidationError('Wishlist title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Wishlist title must be at most 120 characters');
    return new Wishlist(props.id, props.slug, title, props.ownerToken, props.key, 1);
  }

  /** Reconstructs a Wishlist from persisted fields — used by repositories, not by application-layer creation flows. */
  static reconstitute(props: { id: string; slug: string; title: string; ownerToken: string; key: string; keyGen: number }): Wishlist {
    return new Wishlist(props.id, props.slug, props.title, props.ownerToken, props.key, props.keyGen);
  }
}
