import { describe, expect, it } from 'vitest';
import { Wishlist } from './Wishlist.js';
import { DomainValidationError } from '../errors.js';

describe('Wishlist.create', () => {
  const validProps = { id: 'w1', slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' };

  it('creates a wishlist with keyGen starting at 1', () => {
    const wishlist = Wishlist.create(validProps);
    expect(wishlist.id).toBe('w1');
    expect(wishlist.slug).toBe('abc123');
    expect(wishlist.title).toBe('Baby Shower');
    expect(wishlist.keyGen).toBe(1);
  });

  it('trims the title', () => {
    const wishlist = Wishlist.create({ ...validProps, title: '  Baby Shower  ' });
    expect(wishlist.title).toBe('Baby Shower');
  });

  it('rejects an empty title', () => {
    expect(() => Wishlist.create({ ...validProps, title: '   ' })).toThrow(DomainValidationError);
  });

  it('rejects a title over 120 characters', () => {
    expect(() => Wishlist.create({ ...validProps, title: 'a'.repeat(121) })).toThrow(DomainValidationError);
  });
});
