# Architecture Decision Records

An ADR captures one significant decision — the context that forced it,
the choice made, and the consequences accepted.

## Convention

- One decision per file: `NNNN-short-kebab-title.md`, `NNNN` a
  zero-padded sequence number.
- Start from [`0000-adr-template.md`](0000-adr-template.md).
- An accepted ADR is immutable. To change a decision, write a new ADR
  and mark the old one `Superseded by NNNN` (and vice-versa).
- Keep them short. Link to code, issues, or other ADRs rather than
  restating them.
- **Date** is the date the decision was actually made — set it to the
  current date when a new ADR is authored, not left as the template's
  placeholder. **Deciders** is `dtbiedrzycki` unless a specific ADR
  names someone else.

## Status values

`Proposed` → `Accepted` → (`Superseded by NNNN` | `Deprecated`).

## Numbering

ADRs are numbered `0001..N` with no gaps. New ADRs take the next free
number; folding or superseding an ADR does not free its number for
reuse (see "An accepted ADR is immutable" above) except during the
one-time renumbering documented in the restructuring history.

## Index

<!-- Add a row per ADR as it lands. -->

| ADR | Title | Status |
|-----|-------|--------|
| [001](0001-no-accounts-slug-key-for-guests-owner-token-for-owners.md) | No accounts; slug + key for guests, owner token for owners | Accepted |
| [002](0002-holds-are-3-day-extendable-once-operator-configurable.md) | Holds are 3-day, extendable once, operator-configurable duration | Accepted |
| [003](0003-group-gift-contributions-go-to-the-owner-no-designated-buyer.md) | Group gift contributions go to the owner; no designated buyer | Accepted |
| [004](0004-pledged-vs-confirmed-states-payments-unverifiable-by-design.md) | Pledged vs. confirmed states; payments unverifiable by design | Accepted |
| [005](0005-no-shipping-address-collected.md) | No shipping address collected | Accepted |
| [006](0006-single-currency-per-list.md) | Single currency per list | Accepted |
| [007](0007-event-sourcing-for-the-ledger-only-audit-table-for-crud.md) | Event sourcing for the ledger only; audit table for CRUD metadata | Accepted |
| [008](0008-event-streams-scoped-per-item-not-per-list.md) | Event streams scoped per item, not per list | Accepted |
| [009](0009-synchronous-in-transaction-projections-not-eventually.md) | Synchronous in-transaction projections, not eventually consistent | Accepted |
| [010](0010-seq-based-optimistic-concurrency-no-hash-chaining.md) | seq-based optimistic concurrency; no hash chaining | Accepted |
| [011](0011-overfunding-stays-assigned-to-the-same-item.md) | Overfunding stays assigned to the same item | Accepted |
| [012](0012-clean-architecture-backend-front-end-does-not-mirror-it.md) | Clean Architecture backend; front-end does not mirror it | Accepted |
| [013](0013-item-type-immutable-after-first-claim.md) | Item type immutable after first claim | Accepted |
| [014](0014-list-creation-self-locks-gated-by-createsecret-thereafter.md) | List creation self-locks; gated by CREATE_SECRET thereafter | Accepted |
| [015](0015-owner-tokens-are-shared-per-list-not-per-owner.md) | Owner tokens are shared per list, not per-owner | Accepted |
| [016](0016-no-public-list-directory-lookups-fail-generically.md) | No public list directory; lookups fail generically | Accepted |
| [017](0017-items-with-ledger-history-are-archived-not-deleted.md) | Items with ledger history are archived, not deleted | Accepted |
| [018](0018-group-fund-targetminor-is-editable-and-read-live.md) | Group/fund targetMinor is editable and read live | Accepted |
| [019](0019-quantity-may-drop-below-committed-holds-purchases.md) | Quantity may drop below committed holds/purchases | Accepted |
| [020](0020-owner-status-identity-visibility-auto-reveals-at-revealafter.md) | Owner status/identity visibility auto-reveals at revealAfter | Accepted |
| [021](0021-thank-you-tracking-stored-outside-rebuildprojections-scope.md) | Thank-you tracking stored outside rebuildProjections scope | Accepted |
| [022](0022-giver-message-visible-to-owner-immediately-not-spoiler-gated.md) | Giver message visible to owner immediately, not spoiler-gated | Accepted |
| [023](0023-wcag-2-2-level-aa-is-the-accessibility-target.md) | WCAG 2.2 Level AA is the accessibility target | Accepted |
| [024](0024-hold-sheet-and-contribute-flow-use-native-dialog.md) | Hold sheet and contribute flow use native <dialog> | Accepted |
| [025](0025-screen-reader-status-changes-use-aria-live-regions.md) | Screen-reader status changes use ARIA live regions | Accepted |
| [026](0026-axe-core-wired-into-e2e-ci-blocks-on-serious-critical-only.md) | axe-core wired into e2e; CI blocks on serious/critical only | Accepted |
| [027](0027-browser-support-matrix-widened-for-the-guest-facing-surface.md) | Browser support matrix widened for the guest-facing surface | Accepted |
| [028](0028-i18n-groundwork-is-intl-formatting-plus-icu-messageformat.md) | i18n groundwork is Intl formatting plus ICU MessageFormat strings | Accepted |
| [029](0029-performance-resource-targets-set-for-pi-class-hardware.md) | Performance/resource targets set for Pi-class hardware | Accepted |
| [030](0030-logging-metrics-tracing-standardized-on-pino-opentelemetry.md) | Logging/metrics/tracing standardized on pino + OpenTelemetry | Accepted |
| [031](0031-physical-backup-via-vacuum-into-not-raw-file-copy.md) | Physical backup via VACUUM INTO, not raw file copy | Accepted |
| [032](0032-migrations-are-forward-only-rollback-restore-from-backup.md) | Migrations are forward-only; rollback = restore from backup | Accepted |
| [033](0033-crypto-shredding-deferred-whole-list-purge-covers-the-need.md) | Crypto-shredding deferred; whole-list purge covers the need | Accepted |
| [034](0034-threat-model-documented-in-docs-threat-model-md.md) | Threat model documented in docs/threat-model.md | Accepted |
| [035](0035-constant-time-comparison-generalized-to-all-secret.md) | Constant-time comparison generalized to all secret comparisons | Accepted |
| [036](0036-session-and-owner-access-cookies-require-secure-https.md) | Session and owner-access cookies require Secure; HTTPS required | Accepted |
| [037](0037-agpl-3-0-selected-as-project-licence.md) | AGPL-3.0 selected as project licence | Accepted |
| [038](0038-ci-runs-on-github-actions-kept-forge-portable.md) | CI runs on GitHub Actions, kept forge-portable | Accepted |
| [039](0039-security-disclosure-via-a-dedicated-email-address.md) | Security disclosure via a dedicated email address | Accepted |
| [040](0040-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md) | Rate-limit thresholds set as concrete hardcoded defaults | Accepted |
| [041](0041-demo-instance-formally-deferred-not-rejected.md) | Demo instance formally deferred, not rejected | Accepted |
| [042](0042-anonymous-contributions-resolved-name-required-owner-only.md) | Anonymous contributions resolved: name required, owner-only | Accepted |
| [043](0043-sourceurl-env-var-drives-agpl-3-0-network-use-compliance.md) | SOURCE_URL env var drives AGPL-3.0 network-use compliance link | Accepted |
| [044](0044-payment-methods-are-per-list-configuration-not-a-hardcoded.md) | Payment methods are per-list configuration, not a hardcoded enum | Accepted |
| [045](0045-contribution-snapshots-its-payment-method-at-pledge-time.md) | Contribution snapshots its payment method at pledge time | Accepted |
| [046](0046-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md) | Each guest session capped at N concurrent active holds per list | Accepted |
| [047](0047-contribution-amounts-bounded-by-absolute-and-target.md) | Contribution amounts bounded by absolute and target-relative ceilings | Accepted |
| [048](0048-hold-contribution-submits-carry-a-client-generated.md) | Hold/contribution submits carry a client-generated idempotency key | Accepted |
| [049](0049-civil-dates-and-instants-modelled-distinctly-via-per-list.md) | Civil dates and instants modelled distinctly via per-list timezone | Accepted |
| [050](0050-contribution-amount-recorded-only-at-i-ve-sent-it.md) | Contribution amount recorded only at "I've sent it" | Accepted |
| [051](0051-owner-token-recovery-deferred-direct-operator-access-is-the.md) | Owner-token recovery deferred; direct operator access is the path | Accepted |
| [052](0052-guest-key-storage-changed-from-one-way-hash-to-plaintext.md) | Guest key storage changed from one-way hash to plaintext | Accepted |
| [053](0053-guest-invite-qr-available-on-demand-from-the-owner-dashboard.md) | Guest-invite QR available on demand from the owner dashboard | Accepted |
| [054](0054-post-purgeat-lookups-return-the-same-generic-not-found.md) | Post-purgeAt lookups return the same generic not-found response | Accepted |
| [055](0055-instance-teardown-addressed-as-a-documentation-checklist.md) | Instance teardown addressed as a documentation checklist | Accepted |
| [056](0056-owner-configurable-privacynotice-field-shown-only-when-set.md) | Owner-configurable privacyNotice field, shown only when set | Accepted |
| [057](0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md) | GDPR erasure via a redactable side-table (GuestPii), not events | Accepted |
| [058](0058-guest-self-service-data-access-erasure-via-guestdataaccess.md) | Guest self-service data access/erasure via GuestDataAccess secret | Accepted |
| [059](0059-offline-non-monetary-gifts-recorded-via-manualgiftentry.md) | Offline non-monetary gifts recorded via ManualGiftEntry table | Accepted |
| [060](0060-manual-contributions-are-voidable-not-editable.md) | Manual contributions are voidable, not editable | Accepted |
| [061](0061-currency-validation-minor-unit-storage-and-the-ceiling.md) | Currency validation, minor-unit storage, and the ceiling reframe | Accepted |
| [062](0062-the-owner-token-never-travels-in-a-url.md) | The owner token never travels in a URL | Accepted |
| [063](0063-one-periodic-task-with-giver-email-purge-attached.md) | One periodic task, with giver-email purge attached | Accepted |
| [064](0064-revealafter-is-stored-not-derived.md) | revealAfter is stored, not derived | Accepted |
| [065](0065-erasure-across-backups-and-the-subject-access-routing-fix.md) | Erasure across backups, and the subject-access routing fix | Accepted |
| [066](0066-client-ip-resolution-is-a-hop-count.md) | Client IP resolution is a hop count | Accepted |
| [067](0067-the-guest-key-travels-in-a-fragment.md) | The guest key travels in a fragment | Accepted |
| [068](0068-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md) | Devcontainer sandboxes Claude Code auto mode via an egress-proxy sidecar | Accepted |
| [069](0069-claude-code-and-gh-ship-in-the-dev-image-only.md) | Claude Code and gh ship in the development image only, with no baked-in credentials | Accepted |
| [070](0070-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md) | revealedAt makes owner claim-status reveal one-way sticky | Accepted |

## Imported ADRs (0001–0070)

ADRs 0001–0070 were imported from `gubbins-spec.md`'s former §4 ADR
Index — pre-repository product/architecture decisions for the
application itself, plus two repository-native ADRs (devcontainer
sandboxing for Claude Code `auto`-mode runs, and Claude Code/`gh`
credentialing in the dev image — see
[development environment](../spec/development-environment.md)) — both
documenting infrastructure that already existed in the repo before
being written up here. The numbering is gap-free as of this
restructuring; earlier interim states (including a mid-restructuring
renumber and two folded duplicates) are recorded in git history, not in
the current numbering.

*(Not every ADR carries a long Consequences section — some decisions are
fully covered by their linked spec topic and stay short.
ADR-[029](./0029-performance-resource-targets-set-for-pi-class-hardware.md)
([performance & resource budget](../spec/performance-and-resource-budget.md))
and
ADR-[034](./0034-threat-model-documented-in-docs-threat-model-md.md)
([threat model](../spec/threat-model-summary.md)), both fully covered by
their linked spec sections, are among the shortest entries in the
corpus. Absence of length is not absence of reasoning.)*
