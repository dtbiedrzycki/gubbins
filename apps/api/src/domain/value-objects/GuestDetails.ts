import { DomainValidationError } from '../errors.js';

/**
 * Who is holding or buying: a required name and an optional message. This is
 * PII, so it is stored in `guest_pii` and referenced by `piiRef`; it never
 * enters an event (ADR-0057).
 */
export class GuestDetails {
  private readonly _brand = 'GuestDetails' as const;

  private constructor(readonly name: string, readonly message: string | null) {}

  static from(props: { name: string; message?: string | null }): GuestDetails {
    const name = props.name.trim();
    if (name.length === 0) throw new DomainValidationError('Name must not be empty');
    if (name.length > 100) throw new DomainValidationError('Name must be at most 100 characters');
    const message = props.message?.trim() || null;
    if (message !== null && message.length > 300) {
      throw new DomainValidationError('Message must be at most 300 characters');
    }
    return new GuestDetails(name, message);
  }
}
