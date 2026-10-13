import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GuestPiiRepository } from '../GuestPiiRepository.js';

export interface GuestPiiFixture {
  guestPii: GuestPiiRepository;
  dispose(): Promise<void>;
}
export type GuestPiiFactory = () => Promise<GuestPiiFixture>;

export function describeGuestPiiRepositoryContract(adapter: string, factory: GuestPiiFactory): void {
  describe(`GuestPiiRepository contract (${adapter})`, () => {
    let fx: GuestPiiFixture;
    beforeEach(async () => { fx = await factory(); });
    afterEach(async () => { await fx.dispose(); });

    it('round-trips a record by id, with and without a message', async () => {
      const withMessage = { id: 'pii-1', name: 'Ada', message: 'Congratulations!' };
      const without = { id: 'pii-2', name: 'Grace', message: null };
      await fx.guestPii.insert(withMessage);
      await fx.guestPii.insert(without);
      expect(await fx.guestPii.findById('pii-1')).toEqual(withMessage);
      expect(await fx.guestPii.findById('pii-2')).toEqual(without);
    });

    it('returns null for an unknown id', async () => {
      expect(await fx.guestPii.findById('missing')).toBeNull();
    });

    it('refuses a second insert with the same id', async () => {
      await fx.guestPii.insert({ id: 'pii-1', name: 'Ada', message: null });
      await expect(fx.guestPii.insert({ id: 'pii-1', name: 'Other', message: null })).rejects.toThrow();
    });
  });
}
