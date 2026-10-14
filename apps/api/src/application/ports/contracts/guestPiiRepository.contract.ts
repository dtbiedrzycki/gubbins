import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GuestPiiRepository } from '../GuestPiiRepository.js';
import { GuestDetails } from '../../../domain/value-objects/GuestDetails.js';

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

    it('round-trips guest details by id, with and without a message', async () => {
      const withMessage = GuestDetails.from({ name: 'Ada', message: 'Congratulations!' });
      const without = GuestDetails.from({ name: 'Grace' });
      await fx.guestPii.insert('pii-1', withMessage);
      await fx.guestPii.insert('pii-2', without);
      expect(await fx.guestPii.findById('pii-1')).toEqual(withMessage);
      expect(await fx.guestPii.findById('pii-2')).toEqual(without);
    });

    it('returns null for an unknown id', async () => {
      expect(await fx.guestPii.findById('missing')).toBeNull();
    });

    it('refuses a second insert with the same id', async () => {
      await fx.guestPii.insert('pii-1', GuestDetails.from({ name: 'Ada' }));
      await expect(fx.guestPii.insert('pii-1', GuestDetails.from({ name: 'Other' }))).rejects.toThrow();
    });
  });
}
