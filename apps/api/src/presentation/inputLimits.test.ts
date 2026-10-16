import { describe, expect, it } from 'vitest';
import { addItemRequestSchema, createListRequestSchema, holdItemRequestSchema, pledgeRequestSchema } from '@gubbins/shared-types';
import { Item } from '../domain/entities/Item.js';
import { Wishlist } from '../domain/entities/Wishlist.js';
import { DomainValidationError } from '../domain/errors.js';
import { GuestDetails } from '../domain/value-objects/GuestDetails.js';

// Each limit is written twice: in the request schema, so a client gets a 400 naming the field,
// and in the domain, so no other path stores more. These tests keep the two copies equal.

const ID = '11111111-1111-7111-8111-111111111111';
const T0 = new Date('2026-01-01T00:00:00.000Z');
const text = (length: number) => 'a'.repeat(length);
const urlOf = (length: number) => 'https://shop.example/' + text(length - 'https://shop.example/'.length);

function accepts(build: () => unknown): boolean {
  try {
    build();
    return true;
  } catch (error) {
    if (error instanceof DomainValidationError) return false;
    throw error;
  }
}

const single = (props: { title?: string; url?: string; priceMinor?: number }) => () =>
  Item.createSingle({ id: ID, wishlistId: ID, title: 'Cot', asOf: T0, ...props });
const guest = (props: { name?: string; message?: string }) => () => GuestDetails.from({ name: 'Ann', ...props });

/** Per limit: whether the schema, and the domain, accept the value of size `n`. */
const limits: { field: string; limit: number; schema: (n: number) => boolean; domain: (n: number) => boolean }[] = [
  {
    field: 'hold name', limit: 100,
    schema: (n) => holdItemRequestSchema.safeParse({ idempotencyKey: 'k', name: text(n) }).success,
    domain: (n) => accepts(guest({ name: text(n) })),
  },
  {
    field: 'hold message', limit: 300,
    schema: (n) => holdItemRequestSchema.safeParse({ idempotencyKey: 'k', name: 'Ann', message: text(n) }).success,
    domain: (n) => accepts(guest({ message: text(n) })),
  },
  {
    field: 'pledge name', limit: 100,
    schema: (n) => pledgeRequestSchema.safeParse({ idempotencyKey: 'k', amountMinor: 100, name: text(n) }).success,
    domain: (n) => accepts(guest({ name: text(n) })),
  },
  {
    field: 'pledge message', limit: 300,
    schema: (n) => pledgeRequestSchema.safeParse({ idempotencyKey: 'k', amountMinor: 100, name: 'Ann', message: text(n) }).success,
    domain: (n) => accepts(guest({ message: text(n) })),
  },
  {
    field: 'list title', limit: 120,
    schema: (n) => createListRequestSchema.safeParse({ listTitle: text(n), itemTitle: 'Cot' }).success,
    domain: (n) => accepts(() => Wishlist.create({ id: ID, slug: 'abc123', title: text(n), ownerToken: 'o', key: 'k', asOf: T0 })),
  },
  {
    field: 'first item title', limit: 120,
    schema: (n) => createListRequestSchema.safeParse({ listTitle: 'List', itemTitle: text(n) }).success,
    domain: (n) => accepts(single({ title: text(n) })),
  },
  {
    field: 'item title', limit: 120,
    schema: (n) => addItemRequestSchema.safeParse({ type: 'single', title: text(n) }).success,
    domain: (n) => accepts(single({ title: text(n) })),
  },
  {
    field: 'group gift title', limit: 120,
    schema: (n) => addItemRequestSchema.safeParse({ type: 'group', title: text(n), priceMinor: 100 }).success,
    domain: (n) => accepts(() => Item.createGroup({ id: ID, wishlistId: ID, title: text(n), priceMinor: 100, asOf: T0 })),
  },
  {
    field: 'item url', limit: 2048,
    schema: (n) => addItemRequestSchema.safeParse({ type: 'single', title: 'Cot', url: urlOf(n) }).success,
    domain: (n) => accepts(single({ url: urlOf(n) })),
  },
  {
    field: 'item price', limit: 10 ** 12,
    schema: (n) => addItemRequestSchema.safeParse({ type: 'single', title: 'Cot', priceMinor: n }).success,
    domain: (n) => accepts(single({ priceMinor: n })),
  },
];

describe('input limits shared by the request schemas and the domain', () => {
  it.each(limits)('$field: both accept a value at $limit and both refuse one past it', ({ limit, schema, domain }) => {
    expect([schema(limit), domain(limit)]).toEqual([true, true]);
    expect([schema(limit + 1), domain(limit + 1)]).toEqual([false, false]);
  });
});
