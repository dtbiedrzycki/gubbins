# Roadmap: walking skeleton to the full spec

**Status:** Living document. Sub-project 1 is done; 2–7 are a backlog, each to
be brainstormed → specced → planned → implemented separately (one
spec/plan/PR-stack per sub-project).
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
| 2 | **Holds lifecycle** | Expiry (3 days, extend once, ADR-0002), lazy expiry computation, cross-item concurrent-hold cap (ADR-0046), idempotency (ADR-0048). `Hold.expiresAt` is already modelled but not enforced. |
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
| `piiRef` seam | 2 or 5, whichever first introduces a PII field |
| `Item.type` union | 3 |
| `AccessContext` as the only place "session" is built | Enforce from 2 onward |
| Cross-item session-cap logic behind `Wishlist.holdItem` | 2 |

## Open items to act on

1. **Write the ADR for `Wishlist` as aggregate root** (compatible with ADR-0008,
   `Item` reachable only through it). The code landed; no ADR records it yet.
   Do this as sub-project 2's first task.
2. **Verify the quantity-1 assumption is gone** before starting 3: the write path
   must not decide availability itself (`markHeld` recomputing `active_holds`
   instead of taking what the domain decided). The review's fix was a port-shape
   change, not a SQL tweak.
3. **`WishlistNotFoundError(input.slug)`** takes a slug where the parameter implies
   an id; rename the parameter to `identifier` (low priority, log-line accuracy).
4. **Playwright e2e** did not run in some sandboxes because no browser was
   installed; the dev image now bakes in Chromium (version must match the
   lockfile). Confirm e2e runs green in CI before building on it.

## How to start each sub-project

1. Confirm `main` is green and the previous sub-project's PRs are merged.
2. Brainstorm → write `docs/superpowers/specs/<date>-<name>-design.md`.
3. Write the plan under `docs/superpowers/plans/`, then execute it as a
   reviewable PR stack. Rebase `--onto main` before retargeting stacked PRs
   after a squash merge.
