import { describe, expect, it } from 'vitest';
import { addItemRequestSchema, createListRequestSchema, holdItemRequestSchema, pledgeRequestSchema } from '@gubbins/shared-types';
import { Item } from '../domain/entities/Item.js';
import { Wishlist } from '../domain/entities/Wishlist.js';
import { Contribution } from '../domain/entities/Contribution.js';
import { DomainValidationError } from '../domain/errors.js';
import { GuestDetails } from '../domain/value-objects/GuestDetails.js';

// The domain owns every text length, so the request schemas don't limit text; the 1 MiB body
// limit bounds the request as a whole. Numeric limits are still written in both, and these tests
// keep the two copies equal.

const ID = '11111111-1111-7111-8111-111111111111';
const T0 = new Date('2026-01-01T00:00:00.000Z');

function accepts(build: () => unknown): boolean {
  try {
    build();
    return true;
  } catch (error) {
    if (error instanceof DomainValidationError) return false;
    throw error;
  }
}

const single = (props: { title?: string; quantity?: number; url?: string; priceMinor?: number }) => () =>
  Item.createSingle({ id: ID, wishlistId: ID, title: 'Cot', asOf: T0, ...props });
const pledgeRow = {
  id: ID, itemId: ID, sessionHash: 'a'.repeat(64), idempotencyKey: 'k', piiRef: ID, pledgedAt: T0,
};
const guest = (props: { name?: string; message?: string }) => () => GuestDetails.from({ name: 'Ann', ...props });

/** Per field whose least value is 1: whether the schema, and the domain, accept `n`. */
const minimums: { field: string; schema: (n: number) => boolean; domain: (n: number) => boolean }[] = [
  {
    field: 'item quantity',
    schema: (n) => addItemRequestSchema.safeParse({ type: 'single', title: 'Cot', quantity: n }).success,
    domain: (n) => accepts(single({ quantity: n })),
  },
  {
    field: 'item price',
    schema: (n) => addItemRequestSchema.safeParse({ type: 'single', title: 'Cot', priceMinor: n }).success,
    domain: (n) => accepts(single({ priceMinor: n })),
  },
  {
    field: 'pledge amount',
    schema: (n) => pledgeRequestSchema.safeParse({ idempotencyKey: 'k', amountMinor: n, name: 'Ann' }).success,
    domain: (n) => accepts(() => Contribution.reconstitute({ ...pledgeRow, amountMinor: n })),
  },
];

/** Per text the domain trims and refuses when blank: whether the schema, and the domain, accept `t`. */
const nonBlank: { field: string; schema: (t: string) => boolean; domain: (t: string) => boolean }[] = [
  {
    field: 'list title',
    schema: (t) => createListRequestSchema.safeParse({ listTitle: t }).success,
    domain: (t) => accepts(() => Wishlist.create({ id: ID, slug: 'abc123', title: t, ownerToken: 'o', key: 'k', asOf: T0 })),
  },
  {
    field: 'item title',
    schema: (t) => addItemRequestSchema.safeParse({ type: 'single', title: t }).success,
    domain: (t) => accepts(single({ title: t })),
  },
  {
    field: 'group gift title',
    schema: (t) => addItemRequestSchema.safeParse({ type: 'group', title: t, priceMinor: 100 }).success,
    domain: (t) => accepts(() => Item.createGroup({ id: ID, wishlistId: ID, title: t, priceMinor: 100, asOf: T0 })),
  },
  {
    field: 'hold name',
    schema: (t) => holdItemRequestSchema.safeParse({ idempotencyKey: 'k', name: t }).success,
    domain: (t) => accepts(guest({ name: t })),
  },
  {
    field: 'pledge name',
    schema: (t) => pledgeRequestSchema.safeParse({ idempotencyKey: 'k', amountMinor: 100, name: t }).success,
    domain: (t) => accepts(guest({ name: t })),
  },
];

describe('input limits in the request schemas and the domain', () => {
  it('item price: both accept 10^12 and both refuse one more', () => {
    const schema = (n: number) => addItemRequestSchema.safeParse({ type: 'single', title: 'Cot', priceMinor: n }).success;
    const domain = (n: number) => accepts(single({ priceMinor: n }));
    expect([schema(10 ** 12), domain(10 ** 12)]).toEqual([true, true]);
    expect([schema(10 ** 12 + 1), domain(10 ** 12 + 1)]).toEqual([false, false]);
  });

  it.each(minimums)('$field: both accept 1 and both refuse 0', ({ schema, domain }) => {
    expect([schema(1), domain(1)]).toEqual([true, true]);
    expect([schema(0), domain(0)]).toEqual([false, false]);
  });

  it.each(nonBlank)('$field: both accept a single letter, and only the domain refuses only spaces', ({ schema, domain }) => {
    expect([schema('a'), domain('a')]).toEqual([true, true]);
    expect([schema('   '), domain('   ')]).toEqual([true, false]);
  });
});
