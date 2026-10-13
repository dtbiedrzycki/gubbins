export interface ItemHeldEvent {
  type: 'ItemHeld';
  /**
   * Payload version, carried from day one (data & persistence). Bumped only
   * with an upcaster once instances exist; before 1.0 shapes are amended in
   * place at v1.
   */
  v: 1;
  itemId: string;
  holdId: string;
  /**
   * A verifier for the hold's secret, not the secret itself: `event_log` is
   * append-only and never rewritten when a hold expires, so a raw bearer
   * secret written here would outlive the hold it authorises with no reader
   * to retire it. A hash lets a rebuilt `holds` projection still check a
   * presented secret, while the immutable log holds nothing replayable.
   */
  secretHash: string;
  sessionHash: string;
  idempotencyKey: string;
  /**
   * Points at the holder's `guest_pii` row (ADR-0057). The name and message
   * live there, never in this immutable log, so they can be erased.
   */
  piiRef: string | null;
  expiresAt: string; // ISO 8601
  occurredAt: string; // ISO 8601
}
