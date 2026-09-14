import { describe, expect, it } from 'vitest';
import { createUuidId } from './UuidId.js';
import { DomainValidationError } from '../errors.js';
import { WishlistId } from './WishlistId.js';
import { ItemId } from './ItemId.js';
import { HoldId } from './HoldId.js';

describe('createUuidId', () => {
  const TestId = createUuidId('TestId');

  it('accepts a valid UUID v4', () => {
    const id = TestId.from('11111111-1111-4111-8111-111111111111');
    expect(id.value).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('rejects a value that is not a valid UUID v4', () => {
    expect(() => TestId.from('not-a-uuid')).toThrow(DomainValidationError);
  });

  it('includes the brand name in the error message', () => {
    expect(() => TestId.from('nope')).toThrow('TestId must be a valid UUID v4');
  });

  it('brands two different factories as mutually incompatible types', () => {
    const BrandA = createUuidId('BrandA');
    const BrandB = createUuidId('BrandB');
    type BrandA = ReturnType<typeof BrandA.from>;
    type BrandB = ReturnType<typeof BrandB.from>;
    const a = BrandA.from('11111111-1111-4111-8111-111111111111');
    // @ts-expect-error - BrandB must not be assignable where BrandA is expected
    const wrongAssignment: BrandA = BrandB.from('11111111-1111-4111-8111-111111111111');
    void wrongAssignment;
    expect(a.value).toBe('11111111-1111-4111-8111-111111111111');
  });
});

/**
 * Pins the exact brand string each concrete id factory was built with. This
 * guards against, e.g., ItemId.ts accidentally reading
 * `createUuidId('WishlistId')` — a mistake the generic factory's own tests
 * above can't catch, since it only tests brands it invents itself. Living
 * here (rather than three near-empty WishlistId.test.ts/ItemId.test.ts/
 * HoldId.test.ts files) keeps all brand-identity coverage in one place,
 * next to the factory whose guarantee it's actually verifying.
 */
describe('concrete id brands', () => {
  it('rejects an invalid value with its own brand name in the error message', () => {
    expect(() => WishlistId.from('not-a-uuid')).toThrow('WishlistId must be a valid UUID v4');
    expect(() => ItemId.from('not-a-uuid')).toThrow('ItemId must be a valid UUID v4');
    expect(() => HoldId.from('not-a-uuid')).toThrow('HoldId must be a valid UUID v4');
  });
});
