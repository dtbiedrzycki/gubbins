import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OwnerPiiRepository } from '../OwnerPiiRepository.js';
import { PaymentHandle } from '../../../domain/value-objects/PaymentHandle.js';

export interface OwnerPiiFixture {
  ownerPii: OwnerPiiRepository;
  /** A list the rows may belong to. */
  wishlistId: string;
  dispose(): Promise<void>;
}
export type OwnerPiiFactory = () => Promise<OwnerPiiFixture>;

const ROW_1 = '88888888-8888-7888-8888-888888888801';
const ROW_2 = '88888888-8888-7888-8888-888888888802';

export function describeOwnerPiiRepositoryContract(adapter: string, factory: OwnerPiiFactory): void {
  describe(`OwnerPiiRepository contract (${adapter})`, () => {
    let fx: OwnerPiiFixture;
    beforeEach(async () => { fx = await factory(); });
    afterEach(async () => { await fx.dispose(); });

    it("round-trips a pledge's method and handle by id", async () => {
      const venmo = PaymentHandle.from('venmo', 'my-venmo');
      const zelle = PaymentHandle.from('zelle', 'me@example.com');
      await fx.ownerPii.insert(ROW_1, fx.wishlistId, venmo);
      await fx.ownerPii.insert(ROW_2, fx.wishlistId, zelle);
      expect(await fx.ownerPii.findByIds([ROW_1, ROW_2])).toEqual(new Map([[ROW_1, venmo], [ROW_2, zelle]]));
    });

    it('leaves an unknown id out of what it reads', async () => {
      expect(await fx.ownerPii.findByIds([ROW_1])).toEqual(new Map());
    });

    it('reads nothing for no ids', async () => {
      await fx.ownerPii.insert(ROW_1, fx.wishlistId, PaymentHandle.from('venmo', 'my-venmo'));
      expect(await fx.ownerPii.findByIds([])).toEqual(new Map());
    });

    it('refuses a second insert with the same id', async () => {
      await fx.ownerPii.insert(ROW_1, fx.wishlistId, PaymentHandle.from('venmo', 'my-venmo'));
      await expect(fx.ownerPii.insert(ROW_1, fx.wishlistId, PaymentHandle.from('venmo', 'other-venmo'))).rejects.toThrow();
    });
  });
}
