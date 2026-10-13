import { describe, expect, it } from 'vitest';
import { holdViewSchema } from './holdView.js';
import { listViewResponseSchema } from './listView.js';

const view = {
  holdId: 'h', itemId: 'i', status: 'active', expiresAt: '2026-01-04T00:00:00.000Z', extendedAt: null,
  actions: { extend: true, release: true, purchase: true },
};

describe('holdViewSchema', () => {
  it.each(['active', 'expired', 'released', 'purchased'])('accepts a %s hold', (status) => {
    expect(holdViewSchema.safeParse({ ...view, status }).success).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(holdViewSchema.safeParse({ ...view, status: 'reserved' }).success).toBe(false);
  });

  it('requires every action flag', () => {
    expect(holdViewSchema.safeParse({ ...view, actions: { extend: true, release: true } }).success).toBe(false);
  });
});

describe('listViewResponseSchema', () => {
  const listItem = { id: 'i', title: 'x', type: 'single', status: 'held', availableUnits: 0, url: null, priceMinor: null };
  const list = {
    title: 't', item: { id: 'i', title: 'x', status: 'held' }, items: [listItem], payment: { venmoHandle: null, zelleHandle: 'a@b.co' },
    myHolds: [view], capabilities: { holdDurationDays: 3 },
  };

  it('accepts a list with its holds and capabilities', () => {
    expect(listViewResponseSchema.safeParse(list).success).toBe(true);
  });

  it('requires myHolds and capabilities', () => {
    expect(listViewResponseSchema.safeParse({ title: 't', item: list.item }).success).toBe(false);
  });

  it('rejects malformed payment handles', () => {
    expect(listViewResponseSchema.safeParse({ ...list, payment: { venmoHandle: null } }).success).toBe(false);
  });

  it('rejects an item with an unknown type', () => {
    expect(listViewResponseSchema.safeParse({ ...list, items: [{ ...listItem, type: 'bundle' }] }).success).toBe(false);
  });

  it('rejects a hold duration that is not a positive whole number', () => {
    expect(listViewResponseSchema.safeParse({ ...list, capabilities: { holdDurationDays: 0 } }).success).toBe(false);
    expect(listViewResponseSchema.safeParse({ ...list, capabilities: { holdDurationDays: 1.5 } }).success).toBe(false);
  });
});
