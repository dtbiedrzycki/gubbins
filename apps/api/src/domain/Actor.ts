/**
 * The role whose credential authorised a ledger command (ADR-0075). Recorded
 * on every event as envelope metadata — never in a payload, never taken
 * from request input. A role, not an identity: owner tokens are shared per
 * list (ADR-0015), so there is no individual owner to name, and there is no
 * `system` role because nothing emits events on its own (hold expiry is
 * derived).
 */
export type Actor = 'guest' | 'owner';
