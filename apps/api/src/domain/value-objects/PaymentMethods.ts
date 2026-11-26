import { PaymentHandle, type PaymentMethod } from './PaymentHandle.js';
import { UuidId } from './UuidId.js';

/** One of the list's handles, with the id of the owner_pii row that stores it (ADR-0090). */
export interface ListHandle {
  readonly id: UuidId;
  readonly payment: PaymentHandle;
}

/** A list's handles as the owner typed them; blank means none. */
export type ListHandles = { venmoHandle?: string | null; zelleHandle?: string | null };

type StoredHandle = { id: string; handle: string } | null;

/** How guests can pay for a group gift: the list's current Venmo and Zelle handles. */
export class PaymentMethods {
  static readonly none = new PaymentMethods(null, null);

  private constructor(readonly venmo: ListHandle | null, readonly zelle: ListHandle | null) {}

  /** The handles a new list starts with; a blank one means none, and each handle gets a new row id. */
  static mint(raw: ListHandles, ids: { generateEntityId(): string }): PaymentMethods {
    const mint = (method: PaymentMethod, value: string | null | undefined): ListHandle | null => {
      if (!value?.trim()) return null;
      const payment = PaymentHandle.from(method, value); // checked before an id is spent on it
      return { id: UuidId.from(ids.generateEntityId()), payment };
    };
    return new PaymentMethods(mint('venmo', raw.venmoHandle), mint('zelle', raw.zelleHandle));
  }

  /** The list's stored rows, re-checked as they load. */
  static reconstitute(rows: { venmo: StoredHandle; zelle: StoredHandle }): PaymentMethods {
    const load = (method: PaymentMethod, row: StoredHandle): ListHandle | null =>
      row && { id: UuidId.from(row.id), payment: PaymentHandle.from(method, row.handle) };
    return new PaymentMethods(load('venmo', rows.venmo), load('zelle', rows.zelle));
  }

  get venmoHandle(): string | null {
    return this.venmo?.payment.handle ?? null;
  }

  get zelleHandle(): string | null {
    return this.zelle?.payment.handle ?? null;
  }

  isEmpty(): boolean {
    return this.venmo === null && this.zelle === null;
  }
}
