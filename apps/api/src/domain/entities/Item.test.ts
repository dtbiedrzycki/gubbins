import { describe, expect, it } from 'vitest';
import { Item } from './Item.js';
import { DomainValidationError } from '../errors.js';

describe('Item.createSingle', () => {
  it('creates a single-type item with quantity 1', () => {
    const item = Item.createSingle({ id: 'i1', wishlistId: 'w1', title: 'Stroller' });
    expect(item.type).toBe('single');
    expect(item.quantity).toBe(1);
    expect(item.title).toBe('Stroller');
  });

  it('rejects an empty title', () => {
    expect(() => Item.createSingle({ id: 'i1', wishlistId: 'w1', title: '  ' })).toThrow(DomainValidationError);
  });
});
