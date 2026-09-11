# Holds (single items)

- **Duration `HOLD_DURATION_DAYS`, default 3** (§[3.11](ops.md)).
- Language is "hold" / "I'm buying this now" — never "reserve"
- Hold confirmation screen leads with **Mark as purchased** as primary action
- Private hold link `/{slug}/hold/{holdSecret}` to confirm, extend, or release; cookie as secondary
- The hold confirmation screen additionally surfaces the guest
  self-service data link (`/{slug}/my-data/{secret}`, §[3.1](access-identity.md), ADR-[060](../adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md))
  alongside the hold-secret link — shown once, same "Copy link" treatment
- **One self-service extension**, adding a further `HOLD_DURATION_DAYS`.
  The extension is not separately configurable — a second knob adds
  config surface with no evidenced need. Maximum exposure for a single
  item is therefore `2 × HOLD_DURATION_DAYS`.
- Reminder email 24h **before `expiresAt`** if email provided and SMTP
  configured — an offset from expiry, not from hold start, so it stays
  correct at any `HOLD_DURATION_DAYS`. Suppressed entirely where the
  configured duration is short enough that the reminder would fire at or
  before hold creation.
- The reminder is sent by the app's **one periodic task**, an in-process
  interval (default 15 min) — not an external cron, consistent with the
  single-container posture (§[3.11](ops.md)). The task has exactly two duties:
  sending due reminders, and nulling `GuestPii.email` where
  `now > expiresAt + 7 days` (§[3.7](privacy.md), ADR-[065](../adr/0065-one-periodic-task-with-giver-email-purge-attached.md)). Both are idempotent and
  neither affects correctness of any read: a failed or skipped run costs
  a missed reminder and delayed email purge, never a stuck item. Any
  further periodic work requires an ADR — the count of scheduled jobs is
  deliberately fixed at one.
- Expiry is **lazily computed** (`now > expiresAt`), never emitted by a job — a failed cron costs a missed email, not a stuck item
- Purchase is terminal; only the owner can undo it
- Owner can mark an item purchased directly (offline purchase)
- **Concurrent-hold cap per guest session**: a session may hold at most
  `MAX_ACTIVE_HOLDS_PER_SESSION` items at once (default 10 — set well
  above realistic honest use; a generous relative claiming several items
  should never meet it). Marking a hold purchased frees the slot, as does
  release or expiry, so a guest buying many items is never blocked. On
  hitting the cap the guest sees a plain, non-generic message ("You're
  holding the maximum of 10 items — mark one as purchased or release one
  to hold another"); ADR-[016](../adr/0016-no-public-list-directory-lookups-fail-generically.md)'s generic-failure rule governs *pre-auth*
  lookups and does not apply here, where the guest is already keyed in.
  *(ADR-[048](../adr/0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md))*
- `sessionHash` stores a **hash** of the session cookie value, never the
  value itself — a raw session identifier at rest is session-hijack
  material, and §[3.7](privacy.md) places stolen-DB-file mitigation outside the
  application's scope, so the application should avoid writing
  credential-equivalent values there in the first place. Purged with the
  list like all other list data.
- **Owner-side hold release**: the owner dashboard can release any active
  hold, emitting the existing `HoldReleased` event. Needed as the recovery
  path when the cap is set generously and a guest still hoards, and as
  general cleanup for abandoned holds. Subject to the same spoiler gating
  as other claim-status-revealing controls (§[3.14](owner-dashboard.md)).

---

[← Back to spec index](README.md)
