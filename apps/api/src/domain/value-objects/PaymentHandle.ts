import { DomainValidationError } from '../errors.js';

export type PaymentMethod = 'venmo' | 'zelle';

const VENMO_MESSAGE = 'Venmo handle must be 5 to 30 letters, digits, "_" or "-"';
const ZELLE_MESSAGE = 'Zelle handle must be an email or a US phone number';
// Venmo's own username rule, so a typo is caught here rather than on the guest's phone.
const VENMO = /^[A-Za-z0-9_-]{5,30}$/;
const ZELLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZELLE_PHONE = /^\+1\d{10}$/;

function normalize(method: PaymentMethod, raw: string): string {
  const trimmed = raw.trim();
  if (method === 'venmo') return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  if (trimmed.includes('@')) return trimmed.toLowerCase();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  return digits.length === 11 && digits.startsWith('1') ? `+${digits}` : trimmed;
}

/** One Venmo or Zelle handle, normalized: a list's own, or the one a guest reports paying. */
export class PaymentHandle {
  private constructor(readonly method: PaymentMethod, readonly handle: string) {
    if (method === 'venmo' ? !VENMO.test(handle) : !(ZELLE_EMAIL.test(handle) || ZELLE_PHONE.test(handle))) {
      throw new DomainValidationError(method === 'venmo' ? VENMO_MESSAGE : ZELLE_MESSAGE);
    }
  }

  /** Trims and normalizes `raw`; a blank or malformed handle is refused. */
  static from(method: PaymentMethod, raw: string): PaymentHandle {
    return new PaymentHandle(method, normalize(method, raw));
  }
}
