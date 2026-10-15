import { DomainValidationError } from '../errors.js';

function venmo(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return null;
  const handle = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  // Venmo's own username rule, so a typo is caught here rather than on the guest's phone.
  if (!/^[A-Za-z0-9_-]{5,30}$/.test(handle)) throw new DomainValidationError('Venmo handle must be 5 to 30 letters, digits, "_" or "-"');
  return handle;
}

function zelle(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return null;
  if (trimmed.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) throw new DomainValidationError('Zelle handle must be an email or a US phone number');
    return trimmed.toLowerCase();
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  throw new DomainValidationError('Zelle handle must be an email or a US phone number');
}

/** How guests can pay for a group gift. Handles are normalized once, here. */
export class PaymentMethods {
  static readonly none = new PaymentMethods(null, null);

  private constructor(readonly venmoHandle: string | null, readonly zelleHandle: string | null) {}

  static from(props: { venmoHandle?: string | null; zelleHandle?: string | null }): PaymentMethods {
    return new PaymentMethods(venmo(props.venmoHandle), zelle(props.zelleHandle));
  }

  isEmpty(): boolean {
    return this.venmoHandle === null && this.zelleHandle === null;
  }
}
