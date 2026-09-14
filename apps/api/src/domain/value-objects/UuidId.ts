import { DomainValidationError } from '../errors.js';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Builds a nominally-branded UUID v4 value-object class for one entity's
 * identity. WishlistId/ItemId/HoldId were byte-for-byte identical except
 * their brand and error text, so this factory is the one place that logic
 * lives — split an id back out of it only once it needs behavior the
 * others don't. The `Brand` type parameter (not just the runtime string)
 * is what makes two calls to this factory produce mutually-incompatible
 * types: the `#brand` field's type is tied to `Brand`, so
 * `createUuidId('ItemId')`'s instances structurally differ from
 * `createUuidId('WishlistId')`'s even though both classes are declared
 * from the same source.
 *
 * `#brand` is an ECMAScript private field (not TypeScript's `private`
 * keyword) because the project's tsconfig has `declaration: true`, and a
 * `private`-keyword field on a class returned from a generic function trips
 * TS4094 ("exported anonymous class type" may not have a private/protected
 * member) during declaration emit. A true private field sidesteps that
 * while still preventing external construction/comparison — within this
 * project's own source-level compilation, which is the only context that
 * currently matters, since `apps/api` is private and consumed by nothing
 * outside this workspace. That guarantee does NOT survive into a compiled
 * `.d.ts` for an external consumer: the brand's literal string is preserved
 * there, but the ES-private-field encapsulation that makes it unforgeable is
 * not, so a hand-built object literal with the right property key would
 * satisfy the emitted type without ever going through `from`.
 */
export function createUuidId<Brand extends string>(brand: Brand) {
  class UuidId {
    readonly #brand: Brand = brand;

    private constructor(readonly value: string) {}

    static from(value: string): UuidId {
      if (!UUID_V4_PATTERN.test(value)) {
        throw new DomainValidationError(`${brand} must be a valid UUID v4`);
      }
      return new UuidId(value);
    }
  }
  return UuidId;
}
