import { describe, expect, it } from 'vitest';
import { Item } from './Item.js';
import { Contribution } from './Contribution.js';
import { Hold } from './Hold.js';
import { ContributionAmountError, DomainValidationError, ItemUnavailableError } from '../errors.js';

const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const DAY = 86_400_000;
const T0 = new Date('2026-01-01T00:00:00.000Z');
const base = { id: ITEM_ID, wishlistId: WISHLIST_ID, type: 'single', title: 'Stroller', quantity: 1, seq: 0, asOf: T0 };

let holdCount = 0;
function holdOn(overrides: Partial<Parameters<typeof Hold.reconstitute>[0]> = {}): Hold {
  holdCount += 1;
  return Hold.reconstitute({
    id: `00000000-0000-7000-8000-${String(holdCount).padStart(12, '0')}`, itemId: ITEM_ID, secret: 'hold-secret', sessionHash: 'a'.repeat(64),
    idempotencyKey: `idem-${holdCount}`, expiresAt: new Date(T0.getTime() + 3 * DAY), extendedAt: null, releasedAt: null, purchasedAt: null,
    ...overrides,
  });
}

describe('Item.createSingle', () => {
  it('creates a single-type item with quantity 1', () => {
    const item = Item.createSingle({ asOf: T0, id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Stroller' });
    expect(item.type).toBe('single');
    expect(item.quantity).toBe(1);
    expect(item.title).toBe('Stroller');
  });

  it('rejects an empty title', () => {
    expect(() => Item.createSingle({ asOf: T0, id: ITEM_ID, wishlistId: WISHLIST_ID, title: '  ' })).toThrow(DomainValidationError);
  });

  it('rejects an id that is not a valid UUID', () => {
    expect(() => Item.createSingle({ asOf: T0, id: 'i1', wishlistId: WISHLIST_ID, title: 'Stroller' })).toThrow(DomainValidationError);
  });
});

describe('Item kinds, URL and price', () => {
  const ID = ITEM_ID;
  const WL = WISHLIST_ID;
  it.each(['javascript:alert(1)', 'http://shop.example/x', 'data:text/html,hi', 'shop.example', 'https://' + 'a'.repeat(2050)])('refuses a store URL that is not a short https URL (%j)', (url) => {
    expect(() => Item.createSingle({ asOf: T0, id: ID, wishlistId: WL, title: 'T', url })).toThrow(DomainValidationError);
  });
  it('accepts an https store URL', () => {
    expect(Item.createSingle({ asOf: T0, id: ID, wishlistId: WL, title: 'T', url: 'https://shop.example/x' }).url).toBe('https://shop.example/x');
  });
  it.each([0, -1, 1.5, 10 ** 12 + 1])('refuses price %j', (priceMinor) => {
    expect(() => Item.createSingle({ asOf: T0, id: ID, wishlistId: WL, title: 'T', priceMinor })).toThrow(DomainValidationError);
  });
  it('creates a single with the quantity given', () => {
    expect(Item.createSingle({ asOf: T0, id: ID, wishlistId: WL, title: 'T', quantity: 3 }).quantity).toBe(3);
  });
  it('creates a group gift as one unit, refusing one without a price or with a quantity other than 1', () => {
    const group = Item.createGroup({ asOf: T0, id: ID, wishlistId: WL, title: 'Mixer', priceMinor: 45000 });
    expect([group.type, group.quantity, group.priceMinor]).toEqual(['group', 1, 45000]);
    expect(() => Item.reconstitute({ asOf: T0, id: ID, wishlistId: WL, type: 'group', title: 'M', quantity: 1, url: null, priceMinor: null, seq: 0 })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ asOf: T0, id: ID, wishlistId: WL, type: 'group', title: 'M', quantity: 2, url: null, priceMinor: 45000, seq: 0 })).toThrow(DomainValidationError);
  });
});

describe('Item availability and holds — from hold state, never a stored counter', () => {
  it('starts a new item at seq 0, and available', () => {
    const item = Item.createSingle({ asOf: T0, id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Stroller' });
    expect(item.seq).toBe(0);
    expect(item.status()).toBe('available');
  });

  it('restores the persisted seq', () => {
    expect(Item.reconstitute({ ...base, seq: 7 }).seq).toBe(7);
  });

  it('never reports negative availability when quantity is below what is committed (ADR-0019)', () => {
    expect(Item.reconstitute({ ...base, holds: [holdOn(), holdOn({ purchasedAt: T0 })] }).availableUnits()).toBe(0);
  });

  it('is available while the quantity exceeds active and purchased holds', () => {
    const item = Item.reconstitute({ ...base, quantity: 2, holds: [holdOn()] });
    expect(item.availableUnits()).toBe(1);
    expect(item.status()).toBe('available');
  });

  it('is held once active holds take the last unit', () => {
    const item = Item.reconstitute({ ...base, holds: [holdOn()] });
    expect(item.availableUnits()).toBe(0);
    expect(item.status()).toBe('held');
  });

  it('counts its purchased holds, zero when there are none', () => {
    expect(Item.reconstitute({ ...base, quantity: 2, holds: [holdOn({ purchasedAt: T0 }), holdOn({ purchasedAt: T0 })] }).purchasedCount()).toBe(2);
    expect(Item.reconstitute(base).purchasedCount()).toBe(0);
  });

  it('takes one unit for a purchased hold, not a second one as if it were active', () => {
    const item = Item.reconstitute({ ...base, quantity: 4, holds: [holdOn({ purchasedAt: T0 }), holdOn({ purchasedAt: T0 }), holdOn()] });
    expect(item.availableUnits()).toBe(1);
  });

  it('is purchased once purchased holds cover the quantity', () => {
    expect(Item.reconstitute({ ...base, holds: [holdOn({ purchasedAt: T0 })] }).status()).toBe('purchased');
  });

  it('counts neither a released nor an expired hold', () => {
    const item = Item.reconstitute({ ...base, holds: [holdOn({ releasedAt: T0 }), holdOn({ expiresAt: new Date(T0.getTime() - 1) })] });
    expect(item.availableUnits()).toBe(1);
  });

  it('rejects a loaded hold or contribution that is on another item', () => {
    const other = '44444444-4444-7444-8444-444444444444';
    expect(() => Item.reconstitute({ ...base, holds: [holdOn({ itemId: other })] })).toThrow(DomainValidationError);
    const pledge = Contribution.reconstitute({
      id: '66666666-6666-7666-8666-666666666666', itemId: other, amountMinor: 2_500, sessionHash: 'a'.repeat(64),
      idempotencyKey: 'p-1', piiRef: '55555555-5555-7555-8555-555555555555', pledgedAt: T0,
    });
    expect(() => Item.reconstitute({ ...base, type: 'group', priceMinor: 10_000, contributions: [pledge] })).toThrow(DomainValidationError);
  });
});

describe('Item.placeHold', () => {
  const at = T0;
  const GENERATED_HOLD_ID = '55555555-5555-7555-8555-555555555555';
  const GENERATED_SECRET = 'hold-secret';
  const holdProps = { sessionHash: 'a'.repeat(64), idempotencyKey: 'idem-1', durationMs: 3 * DAY, piiRef: '66666666-6666-7666-8666-666666666666' };
  const available = () => Item.reconstitute({ ...base, seq: 4 });
  const fakeTokens = { generateEntityId: () => GENERATED_HOLD_ID, generateHoldSecret: () => GENERATED_SECRET };
  const fakeHasher = { hash: (value: string) => (value === GENERATED_SECRET ? 'f'.repeat(64) : 'e'.repeat(64)) };

  it('mints a hold on this item that expires one duration after the instant it was loaded at', () => {
    const { hold } = available().placeHold(holdProps, fakeTokens, fakeHasher);
    expect(hold.id.value).toBe(GENERATED_HOLD_ID);
    expect(hold.secret.value).toBe(GENERATED_SECRET);
    expect(hold.itemId.value).toBe(ITEM_ID);
    expect(hold.expiresAt).toEqual(new Date(at.getTime() + 3 * DAY));
    expect(hold.piiRef?.value).toBe(holdProps.piiRef);
  });

  it('adds the hold to its own holds', () => {
    const item = available();
    const { hold } = item.placeHold(holdProps, fakeTokens, fakeHasher);
    expect(item.holds).toEqual([hold]);
  });

  it('returns the seq the caller must append against, and advances past it', () => {
    const item = available();
    expect(item.placeHold(holdProps, fakeTokens, fakeHasher).expectedSeq).toBe(4);
    expect(item.seq).toBe(5);
  });

  it('emits an ItemHeld event carrying the hashed secret, not the raw one', () => {
    const { event } = available().placeHold(holdProps, fakeTokens, fakeHasher);
    expect(event).toEqual({
      type: 'ItemHeld', v: 1, itemId: ITEM_ID, holdId: GENERATED_HOLD_ID, secretHash: 'f'.repeat(64),
      sessionHash: holdProps.sessionHash, idempotencyKey: 'idem-1', piiRef: holdProps.piiRef,
      expiresAt: new Date(at.getTime() + 3 * DAY).toISOString(), occurredAt: at.toISOString(),
    });
    expect(event).not.toHaveProperty('secret');
  });

  it('throws ItemUnavailableError when active holds cover the quantity, without advancing seq', () => {
    const item = Item.reconstitute({ ...base, seq: 4, holds: [holdOn()] });
    expect(() => item.placeHold(holdProps, fakeTokens, fakeHasher)).toThrow(ItemUnavailableError);
    expect(item.seq).toBe(4);
  });

  it('throws ItemUnavailableError when purchases cover the quantity', () => {
    const item = Item.reconstitute({ ...base, holds: [holdOn({ purchasedAt: T0 })] });
    expect(() => item.placeHold(holdProps, fakeTokens, fakeHasher)).toThrow(ItemUnavailableError);
  });

  it('cannot be held when it is a group gift', () => {
    const group = Item.createGroup({ asOf: T0, id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Mixer', priceMinor: 45000 });
    expect(() => group.placeHold(holdProps, fakeTokens, fakeHasher)).toThrow(ItemUnavailableError);
  });

  it('rejects a duration that does not put the expiry in the future', () => {
    expect(() => available().placeHold({ ...holdProps, durationMs: 0 }, fakeTokens, fakeHasher)).toThrow(DomainValidationError);
  });
});

describe('Item.recordEvent', () => {
  it('recordEvent returns the seq before the event and advances by one', () => {
    const item = Item.reconstitute({ ...base, seq: 2 });
    expect(item.recordEvent()).toBe(2);
    expect(item.seq).toBe(3);
  });
});

describe('Item.reconstitute', () => {
  it('enforces the title invariant on persisted rows too', () => {
    expect(() => Item.reconstitute({ ...base, title: '' })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ ...base, title: 'a'.repeat(121) })).toThrow(DomainValidationError);
  });

  it('rejects a whitespace-only title, not just an empty one', () => {
    expect(() => Item.reconstitute({ ...base, title: '   ' })).toThrow(DomainValidationError);
  });

  it('passes through the persisted type and quantity', () => {
    const item = Item.reconstitute({ ...base, quantity: 3 });
    expect(item.type).toBe('single');
    expect(item.quantity).toBe(3);
  });

  it('rejects a non-positive or fractional quantity', () => {
    expect(() => Item.reconstitute({ ...base, quantity: 0 })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ ...base, quantity: -1 })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ ...base, quantity: 1.5 })).toThrow(DomainValidationError);
  });

  it('refuses an unknown type', () => {
    expect(() => Item.reconstitute({ ...base, type: 'bundle' })).toThrow(DomainValidationError);
  });

  it('rejects a negative or fractional seq', () => {
    expect(() => Item.reconstitute({ ...base, seq: -5 })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ ...base, seq: 1.5 })).toThrow(DomainValidationError);
  });
});

describe('Item.pledge', () => {
  const CONTRIBUTION_ID = '44444444-4444-7444-8444-444444444444';
  const PII = '55555555-5555-7555-8555-555555555555';
  const ids = { generateEntityId: () => CONTRIBUTION_ID };
  const group = () => Item.createGroup({ asOf: T0, id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Mixer', priceMinor: 45000 });
  const props = { sessionHash: 'a'.repeat(64), idempotencyKey: 'k1', piiRef: PII };

  it('records the pledge and advances the stream', () => {
    const item = group();
    const { contribution, event, expectedSeq } = item.pledge({ ...props, amountMinor: 11250 }, ids);
    expect([contribution.amount.amountMinor, event.type, event.amountMinor, expectedSeq, item.seq]).toEqual([11250, 'ContributionPledged', 11250, 0, 1]);
    expect(event.piiRef).toBe(PII);
    expect(event).not.toHaveProperty('name');
    expect(event).not.toHaveProperty('message');
  });
  it('adds the pledge to its own contributions, pledged at the instant the item was loaded at', () => {
    const item = group();
    const { contribution } = item.pledge({ ...props, amountMinor: 2_500 }, ids);
    expect(item.contributions).toEqual([contribution]);
    expect(contribution.pledgedAt).toEqual(T0);
  });
  it('allows overfunding up to five times the price', () => {
    expect(() => group().pledge({ ...props, amountMinor: 45000 * 5 }, ids)).not.toThrow();
  });
  it.each([
    ['zero', 0],
    ['a negative amount', -100],
    ['a fractional amount', 12.5],
    ['more than five times the price', 45000 * 5 + 1],
  ])('refuses %s', (_, amountMinor) => {
    expect(() => group().pledge({ ...props, amountMinor }, ids)).toThrow(ContributionAmountError);
  });
  it('refuses a pledge on a single item', () => {
    const single = Item.createSingle({ asOf: T0, id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Crib' });
    expect(() => single.pledge({ ...props, amountMinor: 100 }, ids)).toThrow(ItemUnavailableError);
  });
});
