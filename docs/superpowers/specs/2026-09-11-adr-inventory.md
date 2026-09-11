# ADR inventory for Nygard-template rollout

Classification pass over all 72 ADRs under `docs/adr/` (0001–0072), produced
for Task 1 of the `2026-09-11-adr-spec-simplification-pilot` plan. Read-only
analysis: no ADR file was modified to produce this inventory.

## Method

Every file was read in full (not just `docs/adr/README.md`'s one-line
index). Classification rule, applied in order, first match wins:

1. **`merge-candidate`** — `Status` already reads `Superseded by NNNN`, OR
   the ADR's own prose states or implies the *entire* decision is
   superseded even though `Status` hasn't caught up. No ADR may end this
   work still marked superseded. Two ADRs are **amended** by a later one —
   0020 by 0072's sticky-reveal mechanism, 0049 by 0063's currency reframe
   of the absolute ceiling — and two more are marked **superseded in
   part** — 0044 by 0059/0060, 0072 by 0066. All four are *not* rule 1,
   checked against each ADR's own text rather than assumed from the label:
   0044's Decision is "name always required... only the owner sees
   identity"; ADR-059/060 only narrow "always required" to "required at
   creation, nullable by later erasure," leaving the owner-only-visibility
   policy that is the actual core of the decision untouched. 0072's own
   Detail states explicitly that "`revealedAt` is retained and still
   one-way, now guarding the narrower case" after ADR-066 — the sticky
   one-way reveal survives; only the scope of what it guards narrows.
   Because the decision itself stands in every case, partial revision is
   legitimate Context material for a `reformat-only` (or `renumber`)
   rewrite, not rule 1's full-fold trigger. (The former 0052a has been
   renumbered to 0072 to resolve the numbering collision with 0052,
   a given fact independent of this reasoning — it's consistent with
   the conclusion above but isn't the basis for it.)
2. **`renumber`** — the ADR's number collides or is flagged as a numbering
   quirk anywhere in `docs/adr/README.md`. (The 052/052a collision has been
   resolved by renumbering 0052a to 0072.)
3. **`reformat-only`** (default).

`status-fix` was reserved for a non-supersession status error (e.g. an ADR
still marked `Proposed` that's clearly been acted on). A full scan of every
`Status:` line in the corpus (`grep -m1 "Status:"` across all 72 files)
found exactly one non-`Accepted` value — 0038's `Superseded by 0040` — so
no `status-fix` rows exist in this corpus; every status problem found is a
supersession case under rule 1.

**Merge-candidates found: exactly 0022 and 0038 — none beyond the two
already known.** A full-corpus, case-insensitive grep for the exact word
"superseded" (not the shorter stem "supersed", which also matches 0034's
and 0062's unrelated uses of "supersedes"/"superseding" and would need the
same manual triage repeated on those two) turned up only four files using
that word: 0022, 0038 (both full supersessions, rule 1), and 0044/0072
(both partial — see above, not rule 1).

## Table

| ADR | Title | Current Status | Classification | Notes |
|---|---|---|---|---|
| 0001 | No accounts; slug + key for guests, owner token for owners | Accepted | reformat-only | No Detail block; single-line Decision only |
| 0002 | Holds are 3-day, extendable once, operator-configurable duration | Accepted | reformat-only | No Detail block |
| 0003 | Group gift contributions go to the owner; no designated buyer | Accepted | reformat-only | No Detail block |
| 0004 | Pledged vs. confirmed states; payments unverifiable by design | Accepted | reformat-only | No Detail block; cited by 0063 |
| 0005 | No shipping address collected | Accepted | reformat-only | No Detail block |
| 0006 | Single currency per list | Accepted | reformat-only | No Detail block; cited by 0063 |
| 0007 | Event sourcing for the ledger only; audit table for CRUD metadata | Accepted | reformat-only | No Detail block; foundational, cited by 0059/0062 |
| 0008 | Event streams scoped per item, not per list | Accepted | reformat-only | No Detail block; cited by 0059 |
| 0009 | Synchronous in-transaction projections, not eventually consistent | Accepted | reformat-only | No Detail block |
| 0010 | seq-based optimistic concurrency; no hash chaining | Accepted | reformat-only | No Detail block |
| 0011 | Overfunding stays assigned to the same item | Accepted | reformat-only | No Detail block |
| 0012 | Clean Architecture backend; front-end does not mirror it | Accepted | reformat-only | No Detail block |
| 0013 | Item type immutable after first claim | Accepted | reformat-only | No Detail block; precedent cited by 0063's currency-immutability reasoning |
| 0014 | List creation self-locks; gated by CREATE_SECRET thereafter | Accepted | reformat-only | Has Detail; two rejected alternatives (single shared secret, email allow-list) are legitimate Context/Alternatives material |
| 0015 | Owner tokens are shared per list, not per-owner | Accepted | reformat-only | No Detail block |
| 0016 | No public list directory; lookups fail generically | Accepted | reformat-only | No Detail block; load-bearing precedent for 0056's and 0058's enumeration-guard reasoning |
| 0017 | Items with ledger history are archived, not deleted | Accepted | reformat-only | Has Detail; precedent cited by 0062 for rejecting hard delete |
| 0018 | Group/fund targetMinor is editable and read live | Accepted | reformat-only | Has Detail; 0047 carves out a deliberate, distinct exception (payment-method snapshot) |
| 0019 | Quantity may drop below committed holds/purchases | Accepted | reformat-only | Has Detail |
| 0020 | Owner status/identity visibility auto-reveals at revealAfter | Accepted | reformat-only | Amended by 0072 (sticky `revealedAt`); decision itself unchanged — legitimate Context, not supersession |
| 0021 | Thank-you tracking stored outside rebuildProjections scope | Accepted | reformat-only | Has Detail; precedent for 0059's/0061's side-table pattern |
| 0022 | Guest key travels in the invitation URL (transport) | Accepted | merge-candidate | Merge into 0069; superseded in substance, status was never corrected |
| 0023 | Giver message visible to owner immediately, not spoiler-gated | Accepted | reformat-only | Has Detail |
| 0024 | WCAG 2.2 Level AA is the accessibility target | Accepted | reformat-only | Has Detail; target revised up from an initial 2.1 AA |
| 0025 | Hold sheet and contribute flow use native <dialog> | Accepted | reformat-only | Has Detail |
| 0026 | Screen-reader status changes use ARIA live regions | Accepted | reformat-only | Has Detail |
| 0027 | axe-core wired into e2e; CI blocks on serious/critical only | Accepted | reformat-only | Has Detail |
| 0028 | Browser support matrix widened for the guest-facing surface | Accepted | reformat-only | Has Detail |
| 0029 | i18n groundwork is Intl formatting plus ICU MessageFormat | Accepted | reformat-only | Has Detail |
| 0030 | Performance/resource targets set for Pi-class hardware | Accepted | reformat-only | No Detail block (README notes it's fully covered by spec §3.17) |
| 0031 | Logging/metrics/tracing standardized on pino + OpenTelemetry | Accepted | reformat-only | Has Detail |
| 0032 | Physical backup via VACUUM INTO, not raw file copy | Accepted | reformat-only | Has Detail |
| 0033 | Migrations are forward-only; rollback = restore from backup | Accepted | reformat-only | Has Detail; underpins the upcaster-layer reasoning 0034/0050/0067 reference |
| 0034 | Crypto-shredding deferred; whole-list purge covers the need | Accepted | reformat-only | Deferral upheld (re-tested by 067), not superseded — cross-refs to 059/067 are legitimate Context material |
| 0035 | Threat model documented in docs/threat-model.md | Accepted | reformat-only | No Detail block (README notes it's fully covered by spec §3.21) |
| 0036 | Constant-time comparison generalized to all secret comparisons | Accepted | reformat-only | Has Detail |
| 0037 | Session and owner-access cookies require Secure; HTTPS required | Accepted | reformat-only | Has Detail |
| 0038 | Superseded by 040 | Superseded by 0040 | merge-candidate | Fold into 0040 (piloted in Task 9); no independent rationale to preserve — 040's existing Detail already covers it |
| 0039 | AGPL-3.0 selected as project licence | Accepted | reformat-only | Has Detail; rejects GPL-3.0/EUPL-1.2/OSL-3.0/SSPL |
| 0040 | CI hosted on Forgejo Actions via Codeberg, not GitHub Actions | Accepted | reformat-only | Has Detail; is the target ADR 0038 merges into |
| 0041 | Security disclosure via a dedicated email address | Accepted | reformat-only | Has Detail |
| 0042 | Rate-limit thresholds set as concrete hardcoded defaults | Accepted | reformat-only | Has Detail; its venue-wifi false-positive concern is later revisited (not superseded) by 0068's mechanism fix |
| 0043 | Demo instance formally deferred, not rejected | Accepted | reformat-only | Has Detail |
| 0044 | Anonymous contributions resolved: name required, owner-only | Accepted | reformat-only | Has Detail; "superseded in part" by 0059/0060 (redaction may later null the name) — decision core (name required at creation, owner-only visibility) still stands, not a full supersession |
| 0045 | SOURCE_URL env var drives AGPL-3.0 network-use compliance link | Accepted | reformat-only | Has Detail; precedent cited by 0058 |
| 0046 | Payment methods are per-list configuration, not a hardcoded enum | Accepted | reformat-only | Has Detail |
| 0047 | Contribution snapshots its payment method at pledge time | Accepted | reformat-only | Has Detail; deliberate, named exception to 0018's live-read rule |
| 0048 | Guest sessions capped at N concurrent active holds per list | Accepted | reformat-only | Has Detail |
| 0049 | Contribution amounts bounded by absolute and target-relative ceilings | Accepted | reformat-only | Amended by 0063 on the absolute bound only; target-relative bound and independence from `allowOverfunding` stand — legitimate Context, not supersession |
| 0050 | Hold/contribution submits carry a client-generated idempotency key | Accepted | reformat-only | Has Detail |
| 0051 | Civil dates and instants modelled distinctly via per-list timezone | Accepted | reformat-only | Has Detail; foundational for 0072/0066's reveal-timing reasoning |
| 0052 | Contribution amount recorded only at "I've sent it" | Accepted | reformat-only | Has Detail; distinct in purpose from 0060's later guest-data-access secret (recovery convenience vs. subject-access right) |
| 0053 | Owner-token recovery deferred; direct operator access is the path | Accepted | reformat-only | Has Detail; owner-email field collected against this deferred flow was later removed as purposeless |
| 0054 | Guest key storage changed from one-way hash to plaintext | Accepted | reformat-only | Has Detail; enables 0055's on-demand QR regeneration |
| 0055 | Guest-invite QR available on demand from the owner dashboard | Accepted | reformat-only | Has Detail; depends on 0054's plaintext storage |
| 0056 | Post-purgeAt lookups return the same generic not-found response | Accepted | reformat-only | Has Detail; upholds 0016's enumeration guard rather than carving an exception |
| 0057 | Instance teardown addressed as a documentation checklist | Accepted | reformat-only | Has Detail |
| 0058 | Owner-configurable privacyNotice field, shown only when set | Accepted | reformat-only | Has Detail; a later spec change removed pre-auth rendering of the notice (enumeration + operator-identity leak), resolved by splitting pre/post-auth surfaces — recorded in the same ADR, not a separate supersession |
| 0059 | GDPR erasure via a redactable side-table (GuestPii), not events | Accepted | reformat-only | Has Detail; amends 0034's original event-based compensating-event sketch (which would have left plaintext recoverable from the immutable log) — 0034 itself remains reformat-only per its own row |
| 0060 | Guest self-service data access/erasure via GuestDataAccess secret | Accepted | reformat-only | Has Detail; deliberate granularity inversion against 0059 (session-scoped secret vs. per-record storage), not a conflict |
| 0061 | Offline non-monetary gifts recorded via ManualGiftEntry table | Accepted | reformat-only | Has Detail |
| 0062 | Manual contributions are voidable, not editable | Accepted | reformat-only | Has Detail; its resolution breaks a cross-reference in 0061 (precedent cited there no longer holds), but 0061's affordance stands independently — noted in-file, not a supersession of either |
| 0063 | Currency validation, minor-unit storage, and the ceiling reframe | Accepted | reformat-only | Has Detail; amends 0049's absolute bound only |
| 0064 | The owner token never travels in a URL | Accepted | reformat-only | Has Detail; explicitly distinguishes itself from 0022's guest-specific convenience reasoning rather than mirroring it |
| 0065 | One periodic task, with giver-email purge attached | Accepted | reformat-only | Has Detail |
| 0066 | revealAfter is stored, not derived | Accepted | reformat-only | Has Detail; reverses 0072's rejection of a stored instant (0072's own row already reflects this as partial supersession) |
| 0067 | Erasure across backups, and the subject-access routing fix | Accepted | reformat-only | Has Detail; re-examines and reaffirms 0034's crypto-shredding deferral rather than reopening it |
| 0068 | Client IP resolution is a hop count | Accepted | reformat-only | Has Detail; fixes a mechanism defect that is a sibling of, not a re-tune of, 0042's rate-limit thresholds |
| 0069 | The guest key travels in a fragment | Accepted | reformat-only | Has Detail; is the target ADR 0022 merges into |
| 0070 | Devcontainer sandboxes Claude Code auto mode via an egress-proxy sidecar | Accepted | reformat-only | Has Detail; repo-native ADR (not imported from gubbins-spec.md) |
| 0071 | Claude Code and gh ship in the app image with no baked-in credentials | Accepted | reformat-only | Has Detail; repo-native ADR; depends on 0070's sandbox boundary |
| 0072 | revealedAt makes owner claim-status reveal one-way sticky | Accepted | renumber | resolved from 0052a; eliminated the 052/052a collision |

## Verification

- Row count: 72 (`grep -c '^| 00' docs/superpowers/specs/2026-09-11-adr-inventory.md`
  matches the 72 files under `docs/adr/`, excluding `README.md` and
  `0000-adr-template.md`).
- Every row has a non-empty Classification.
- Both `merge-candidate` rows (0022, 0038) and the one `renumber` row
  (0072) name their partner ADR / target number in Notes.
- Classification breakdown: 69 `reformat-only`, 2 `merge-candidate` (0022,
  0038), 1 `renumber` (0072), 0 `status-fix`.
