export interface ItemHeldEvent {
  type: 'ItemHeld';
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
  expiresAt: string; // ISO 8601
  occurredAt: string; // ISO 8601
}
