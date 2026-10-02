# Roadmap: walking skeleton to the full spec

**Status:** Living document. Sub-project 1 is done; sub-project 2 is in
progress ([spec](../specs/2026-09-30-holds-lifecycle-design.md); stack A [plan](2026-10-01-holds-stack-a-guest-manages-a-hold.md)); 2b–7
are a backlog, each to be brainstormed → specced → planned → implemented
separately (one spec/plan/PR-stack per sub-project).
**Date:** 2026-09-30
**Provenance:** the decomposition was proposed and agreed on 2026-09-12 when the
walking-skeleton design was brainstormed (its Purpose section summarises it);
this document adds the build order's detail, the carry-forward items raised
during the skeleton's reviews, and the DDD foundation decisions made on
2026-09-13.

## Sub-projects, in build order

| # | Sub-project | Scope |
|---|---|---|
| 1 | **Stack decisions + walking skeleton** — *done* | Stack ADRs, layered backend, React SPA, CI, and the thinnest slice (owner creates a list → guest enters key → guest holds one item). Follow-ons merged to main 2026-09-30: DDD foundation retrofit (`Wishlist` aggregate root, bearer-secret value objects) and the OpenAPI contract. |
| 2 | **Holds lifecycle** — *in progress* ([spec](../specs/2026-09-30-holds-lifecycle-design.md)) | Expiry (3 days, extend once, ADR-0002), lazy expiry computation, cross-item concurrent-hold cap (ADR-0046), idempotency (ADR-0048). Scope widened during brainstorming (2026-09-30) to include multi-item lists (quantity ≥ 1), guest PII on holds (`GuestPii` + `piiRef`), the reminder email and the one periodic task, owner access with owner-side hold release, and a minimal spoiler model. The hold credential becomes a client-held Ed25519 seed carried in a URL fragment; the server stores only the public key. |
| 2b | **Cross-device session transfer** | Let a guest move their session to another device by QR code or email, started from the current device. Covers switching devices, not a lost session (the saved hold link covers that). Consider reusing sub-project 2's Ed25519 signing scheme, device-bound keys or passkeys, and a client-initiated email of the hold link (the server never holds the seed, so it cannot send the link itself). Overlaps ADR-0058's my-data link; decide whether they are one mechanism. |
| 3 | **Group gifts & funds** | Contributions, `allowOverfunding` policy (the Strategy pattern's first real use), payment methods (ADR-0044/0045), pledge-time snapshotting, `Money`/`Currency` value objects, `Item.type` as a `single \| group \| fund` union. |
| 4 | **Owner dashboard** | Settings, reveal/spoiler timing (`revealAfter`, `revealedAt`), reconciliation, thank-you tracking, manual gift entries. |
| 5 | **Privacy / GDPR surface** | Guest data access and erasure, `GuestPii` redaction, key rotation. |
| 6 | **Ops & hardening** | Rate limiting, backups/restore, observability (pino + OpenTelemetry via the Decorator seam), i18n groundwork, a11y CI gate, Pi-class performance validation. |
| 7 | **Release readiness** | Licensing / `SOURCE_URL` compliance, security disclosure, remaining threat-model test coverage. |

The spec topics under `docs/spec/` and the ADRs are the source of truth for each
sub-project's requirements; this table only orders and groups them.

## Domain foundation decisions (2026-09-13)

From two independent design reviews of the skeleton's domain model. These
constrain sub-projects 2–5.

- **No `UserSession` aggregate.** ADR-0015 (no per-owner identity) and ADR-0016
  (no list enumeration) rule it out. "Session" survives only as a request-scoped
  `AccessContext` built in `presentation/` from the cookie, never persisted.
- **`Wishlist` is the aggregate root** and owns its `Item`s, `PaymentMethod`s, and
  the secrets. This is orthogonal to ADR-0008: event streams stay per-item;
  the aggregate is about who enforces invariants, not storage partitioning.
- **`Hold` and `Contribution` are their own aggregates**, referenced by `itemId`.
  `Wishlist` authorizes them via a command method (`holdItem`) and the use case
  then persists them in the same unit of work.
- **`Purchase` is a terminal state of `Hold`** (`Hold.markPurchased()`), not a
  fourth aggregate. Settle this before implementing it.
- **Plain-CRUD entities sit outside the event-sourced graph:** `GuestPii`,
  `GuestDataAccess`, `ThankYouStatus`, `ManualGiftEntry`. Referenced by id only;
  never folded, never in `rebuildProjections`.
- **`PiiRef` seam:** no holder name/email/message may ever be inlined into an
  event payload (erasure would require rewriting history, which ADR-0032
  forbids). Build `GuestPii` + `piiRef` the moment the first PII field appears.
- **The ADR-0046 cap is soft.** A concurrent double-request from one session
  can overshoot by one; accept it. If it must be airtight, add a
  `(wishlistId, sessionHash)` counter row updated in the same transaction.
- Never build any per-owner distinguishing mechanism.

### Where the "lay down now" items land

| Item | Status / sub-project |
|---|---|
| Close the `ItemRepository` bypass (`Wishlist` as sole entry point) | Done (skeleton retrofit) |
| Bearer secrets as value objects with `.matches()` | Done (skeleton retrofit). `OwnerToken` and `HoldSecret` had no live call site at that point; they get one with owner auth (4) and hold-secret checks (2). |
| `Money` / `Currency` VOs | 3, at the moment `priceMinor` lands |
| `piiRef` seam | 2 (the hold sheet introduces holder name, email and message) |
| `Item.type` union | 3 |
| `AccessContext` as the only place "session" is built | 2: grown from `SessionPayload`, passed to use cases beside `TransactionContext` |
| Cross-item session-cap logic behind `Wishlist.holdItem` | 2 |

## Open items to act on

1. ~~**Write the ADR for `Wishlist` as aggregate root.**~~ Done:
   ADR-[078](../../adr/0078-wishlist-is-the-aggregate-root.md) (holds stack A, PR 1).
2. **Verify the quantity-1 assumption is gone** before starting 3: the write path
   must not decide availability itself (`markHeld` recomputing `active_holds`
   instead of taking what the domain decided). The review's fix was a port-shape
   change, not a SQL tweak. Sub-project 2 resolves this: `active_holds` is
   dropped and `saveItemState` writes only what the domain decided.
3. **`WishlistNotFoundError(input.slug)`** takes a slug where the parameter implies
   an id; rename the parameter to `identifier` (low priority, log-line accuracy).
4. ~~**Playwright e2e** did not run in some sandboxes because no browser was
   installed.~~ Confirmed running in CI: `main` at `11cf71f` (run
   36897900694, 2026-10-01) ran the `e2e` job's `npm run test:e2e` step to
   success, and it passes locally in the dev image. Playwright fails a run
   that finds no tests, so success means the spec actually ran.

## How to start each sub-project

1. Confirm `main` is green and the previous sub-project's PRs are merged.
2. Brainstorm → write `docs/superpowers/specs/<date>-<name>-design.md`.
3. Write the plan under `docs/superpowers/plans/`, then execute it as a
   reviewable PR stack. Rebase `--onto main` before retargeting stacked PRs
   after a squash merge.
