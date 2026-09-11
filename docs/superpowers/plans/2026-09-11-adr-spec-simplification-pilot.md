# ADR & Spec Simplification — Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `gubbins-spec.md` into `docs/spec/` (mirroring the existing `docs/adr/` split), rewrite it and the ADR cross-reference network to point at the new files, and validate the ADR Nygard-rewrite/merge/renumber approach on a small pilot batch — producing a complete 72-row ADR inventory that a **second, follow-up plan** uses to roll the validated pattern out to the remaining ADRs.

**Scope note:** This plan does NOT rewrite all 72 ADRs to Nygard format. Only 3 are touched here (0001, 0070, and the 022+069 merge) — enough to validate the pattern per the approved design. The other ~65 get their own plan once this pilot is reviewed and Task 1's inventory exists to drive it (a plan written against unclassified files would be full of "apply the pattern" placeholders, which `writing-plans` disallows).

**Architecture:** Two independent workstreams that happen to share one plan because the second depends on infrastructure (the link-mapping table) the first produces. Workstream A (Tasks 2-7) moves `gubbins-spec.md` content into topic files without changing a word of substance. Workstream B (Tasks 8-11) reformats/merges/renumbers a handful of ADRs to the repo's own Nygard template. Task 1 (inventory) and Task 12 (final verify) bracket both.

**Tech Stack:** Markdown, git, grep/sed for mechanical link rewrites. No code, no build step.

**Spec:** `docs/superpowers/specs/2026-09-11-adr-spec-simplification-design.md` — executors should read this plan and that spec together; the spec has the full rationale for *why* each rule below exists.

## Global Constraints

- No product/architecture decision changes — content is reorganized and condensed, never reversed or reinterpreted (spec: Non-goals).
- ADR numbers stay stable except the one known collision: 052a → 072 (spec: Redundancy cleanup, rule 3).
- Merged/retired ADR files are deleted outright, no tombstone stub — git history is the record (spec: Redundancy cleanup, rule 2).
- Every markdown link touched by a task must resolve after that task's commit — verify with grep before committing, not after the fact.
- Follow the Nygard template at `docs/adr/0000-adr-template.md` exactly: `Context` / `Decision` / `Alternatives considered` / `Consequences`, in that order.

## Reference: anchor & cross-link mapping

Used by Tasks 3, 4, 5, 6. Old anchor is how `gubbins-spec.md` sections are
currently linked from ADRs (`../../gubbins-spec.md#anchor` — two levels up
from `docs/adr/`) and from within the spec itself (`#anchor`). New location
is where that content lives after the split.

| Old anchor | New file (relative to `docs/spec/`) |
|---|---|
| `#1-overview` | *(stays in root; link becomes `../../gubbins-spec.md#1-overview` from `docs/spec/`, or `gubbins-spec.md#1-overview` from `docs/adr/`)* |
| `#2-domain-model` | `domain-model.md` |
| `#invariants` | `domain-model.md#invariants` |
| `#31-access--identity` | `access-identity.md` |
| `#32-names` | `names.md` |
| `#33-holds-single-items` | `holds.md` |
| `#34-group-gifts--funds` | `group-gifts-and-funds.md` |
| `#35-payments` | `payments.md` |
| `#36-manual-contributions` | `manual-contributions.md` |
| `#37-privacy` | `privacy.md` |
| `#38-data--persistence` | `data-and-persistence.md` |
| `#39-backend-architecture` | `backend-architecture.md` |
| `#310-front-end-architecture` | `frontend-architecture.md` |
| `#311-ops` | `ops.md` |
| `#312-development-environment` | `development-environment.md` |
| `#313-testing` | `testing.md` |
| `#314-owner-dashboard--editing-rules` | `owner-dashboard.md` |
| `#315-guest-ux--browse-hold-contribute-mobile-first-375px` | `guest-ux.md` |
| `#316-accessibility--browser-support` | `accessibility-and-browser-support.md` |
| `#317-performance--resource-budget` | `performance-and-resource-budget.md` |
| `#318-backup-restore--upgrade-safety` | `backup-restore-and-upgrade.md` |
| `#319-observability-logging-metrics-tracing` | `observability.md` |
| `#320-governance-licensing--release-process` | `governance-licensing-and-release.md` |
| `#321-threat-model` | `threat-model.md` |
| `#322-time-timezones--display` | `time-and-timezones.md` |
| `#4-adr-index` | *(dropped — replace with `docs/adr/README.md`)* |
| `#5-open-questions` and any cluster sub-anchor | *(dropped — the resolution is now the cited ADR itself; drop the link, keep the prose if it states a fact, and flag anything that doesn't reduce cleanly for manual review in the task's commit message)* |

Link path rules:
- From one `docs/spec/*.md` file to another: bare filename, e.g. `[Privacy](privacy.md)`.
- From `docs/spec/*.md` to `docs/adr/*.md`: `../adr/NNNN-slug.md` (sibling directories under `docs/`).
- From `docs/spec/*.md` to root `gubbins-spec.md` §1: `../../gubbins-spec.md#1-overview`.
- From `docs/adr/*.md` to `docs/spec/*.md`: `../spec/<file>.md` (replaces the old `../../gubbins-spec.md#anchor` form).
- From root `gubbins-spec.md` to `docs/spec/*.md`: `docs/spec/<file>.md`.

---

### Task 1: ADR inventory pass

**Files:**
- Create: `docs/superpowers/specs/2026-09-11-adr-inventory.md`

**Interfaces:**
- Consumes: the 72 files in `docs/adr/` (0001-0071 plus 0052a) and `docs/adr/README.md`.
- Produces: a classification every later task (and the follow-up rollout plan) reads by ADR number. Classification values are exactly one of `reformat-only`, `merge-candidate`, `status-fix`, `renumber`.

- [ ] **Step 1: List every ADR**

Run: `ls docs/adr/*.md | grep -v README | grep -v 0000-adr-template`
Expected: 72 filenames.

- [ ] **Step 2: Read and classify each ADR**

For each file, read it in full and classify using these rules, applied in order (first match wins):
1. If its own prose states or implies it's superseded/obsolete but `Status` doesn't already say `Superseded by NNNN` → `merge-candidate` if the superseding ADR could absorb its remaining unique content into a Context section, else `status-fix` if it should just get a corrected Status line.
2. If its number collides or is flagged as a numbering quirk anywhere in `docs/adr/README.md` → `renumber`.
3. Otherwise → `reformat-only`.

Record one row per ADR: `| NNNN | Title | Current Status | Classification | Notes (partner ADR / new number / why) |`.

Seed the table with these four already-confirmed rows so the pattern is unambiguous:

```markdown
| ADR | Title | Current Status | Classification | Notes |
|---|---|---|---|---|
| 0022 | Guest key travels in the invitation URL (transport) | Accepted | merge-candidate | Merge into 0069; superseded in substance, status was never corrected |
| 0052a | revealedAt makes owner claim-status reveal one-way sticky | Accepted | renumber | → 0072; resolves the 052/052a collision `docs/adr/README.md` flags as unresolved |
| 0034 | Crypto-shredding deferred; whole-list purge covers the need | Accepted | reformat-only | Deferral upheld (re-tested by 067), not superseded — cross-refs to 059/067 are legitimate Context material |
| 0038 | Superseded by 040 | Superseded by 0040 | reformat-only | Already minimal and correctly `Superseded`; verify it still matches the target shape after the template's headings are applied |
```

- [ ] **Step 3: Verify completeness**

Run: `grep -c '^| 0' docs/superpowers/specs/2026-09-11-adr-inventory.md` (adjust the pattern to match your table's leading column) and confirm it equals 72.
Confirm every row has a non-empty Classification and, for `merge-candidate`/`renumber` rows, a non-empty Notes cell naming the partner ADR or new number.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-11-adr-inventory.md
git commit -m "docs: complete ADR inventory for Nygard rollout classification"
```

---

### Task 2: Scaffold `docs/spec/`

**Files:**
- Create: `docs/spec/domain-model.md`
- Create: `docs/spec/README.md` (skeleton — full index filled in by Task 5)

**Interfaces:**
- Consumes: `gubbins-spec.md` lines 38-283 (current `## 2. Domain Model` section, including its `### Invariants` subsection).
- Produces: `docs/spec/domain-model.md`, linked by every other `docs/spec/*.md` file created in Tasks 3-4.

- [ ] **Step 1: Extract the Domain Model section**

Read `gubbins-spec.md` lines 38-283. Write `docs/spec/domain-model.md` containing that content verbatim, with these transformations only:
- The `## 2. Domain Model` heading becomes `# Domain Model`.
- The `### Invariants` sub-heading is unchanged (still produces the `#invariants` anchor).
- Apply the anchor & cross-link mapping table above to every link inside this content: any `(#3x-...)` link becomes a bare filename link to the matching `docs/spec/*.md` file (e.g. `(#37-privacy)` → `(privacy.md)`); any `ADR-[NNN](docs/adr/NNNN-slug.md)` link must become `ADR-[NNN](../adr/NNNN-slug.md)` — the original path was relative to the repo root, and this file now lives one directory level away from `docs/adr/`.
- Append a one-line footer: `\n---\n\n[← Back to spec index](README.md)`.

- [ ] **Step 2: Create the `docs/spec/README.md` skeleton**

```markdown
# Self-Hosted Wishlist — Spec

Split from the single `gubbins-spec.md` file into one file per topic, the
same way `docs/adr/` splits decisions one-per-file. Start at
[`domain-model.md`](domain-model.md) — nearly every topic file assumes it.

See [`../../gubbins-spec.md`](../../gubbins-spec.md) for the overview,
design principles, and non-goals, and [`../adr/README.md`](../adr/README.md)
for the decision log.

## Index

<!-- Task 5 fills in one row per topic file. -->

| Topic | File |
|---|---|
| Domain model | [domain-model.md](domain-model.md) |
```

- [ ] **Step 3: Verify**

Run: `wc -l docs/spec/domain-model.md` — expect roughly 250 lines (246 lines of source + heading/footer changes).
Run: `grep -n '#3[0-9]-\|#2-domain-model\|#invariants)' docs/spec/domain-model.md` — expect no matches (all such anchors should have been rewritten to file links or already point within this file correctly).

- [ ] **Step 4: Commit**

```bash
git add docs/spec/
git commit -m "docs: scaffold docs/spec/ with domain-model.md"
```

---

### Task 3: Split §3.1–3.11 into topic files

**Files:**
- Create: `docs/spec/access-identity.md` (source: `gubbins-spec.md` lines 286-461)
- Create: `docs/spec/names.md` (462-481)
- Create: `docs/spec/holds.md` (482-533)
- Create: `docs/spec/group-gifts-and-funds.md` (534-565)
- Create: `docs/spec/payments.md` (566-601)
- Create: `docs/spec/manual-contributions.md` (602-628)
- Create: `docs/spec/privacy.md` (629-726)
- Create: `docs/spec/data-and-persistence.md` (727-776)
- Create: `docs/spec/backend-architecture.md` (777-817)
- Create: `docs/spec/frontend-architecture.md` (818-828)
- Create: `docs/spec/ops.md` (829-894)

**Interfaces:**
- Consumes: `gubbins-spec.md` (current, pre-Task-5-trim), `docs/spec/domain-model.md` (Task 2, for the back-link pattern).
- Produces: 11 files other `docs/spec/*.md` files and `docs/adr/*.md` files (Task 6) link into.

- [ ] **Step 1: Extract each section**

For each row above: read the given line range from `gubbins-spec.md`, write it to the target file. Transformations, applied uniformly:
- The `### 3.N Title` heading becomes `# Title` (drop the `3.N` numeral — the filename is now the identifier).
- Apply the anchor & cross-link mapping table to every link in the extracted text (cross-section anchors → sibling filenames; `docs/adr/NNNN-slug.md` links → `../adr/NNNN-slug.md`).
- Append the footer: `\n---\n\n[← Back to spec index](README.md)`.

- [ ] **Step 2: Verify no un-mapped anchors remain**

Run: `grep -n '#3[0-9]\+-\|#2-domain-model\|#4-adr-index\|#5-open-questions' docs/spec/*.md`
Expected: no output. Any hit means a link in the mapping table was missed — fix it before continuing.

- [ ] **Step 3: Verify content preservation**

For each new file, confirm no sentence was dropped: `diff <(sed -n '286,461p' gubbins-spec.md) <(sed '1d;$d' docs/spec/access-identity.md)` style spot-check on at least 3 of the 11 files (heading and footer lines will differ; body text should not).

- [ ] **Step 4: Commit**

```bash
git add docs/spec/
git commit -m "docs: split spec §3.1-3.11 into docs/spec/ topic files"
```

---

### Task 4: Split §3.12–3.22 into topic files

**Files:**
- Create: `docs/spec/development-environment.md` (895-932)
- Create: `docs/spec/testing.md` (933-1068)
- Create: `docs/spec/owner-dashboard.md` (1069-1225)
- Create: `docs/spec/guest-ux.md` (1226-1337)
- Create: `docs/spec/accessibility-and-browser-support.md` (1338-1432)
- Create: `docs/spec/performance-and-resource-budget.md` (1433-1457)
- Create: `docs/spec/backup-restore-and-upgrade.md` (1458-1497)
- Create: `docs/spec/observability.md` (1498-1527)
- Create: `docs/spec/governance-licensing-and-release.md` (1528-1635)
- Create: `docs/spec/threat-model.md` (1636-1725)
- Create: `docs/spec/time-and-timezones.md` (1726-1797)

**Interfaces:** same as Task 3, plus consumes Task 3's files (several of these sections cross-reference §3.1-3.11 topics, e.g. `owner-dashboard.md` references `holds.md`).

- [ ] **Step 1: Extract each section** — same procedure as Task 3, Step 1, using the line ranges and target files above (note: these line numbers are against the *original* `gubbins-spec.md`, which Task 3 does not modify — only reads from — so they're still valid here).

- [ ] **Step 2: Verify no un-mapped anchors remain** — same command as Task 3, Step 2, re-run across all 22 files now that both batches exist.

- [ ] **Step 3: Verify content preservation** — spot-check at least 3 of these 11 files as in Task 3, Step 3.

- [ ] **Step 4: Commit**

```bash
git add docs/spec/
git commit -m "docs: split spec §3.12-3.22 into docs/spec/ topic files"
```

---

### Task 5: Finish `docs/spec/README.md` index and trim root `gubbins-spec.md`

**Files:**
- Modify: `docs/spec/README.md`
- Modify: `gubbins-spec.md` (full rewrite of content, same path)

**Interfaces:**
- Consumes: all 22 files from Tasks 3-4 plus `domain-model.md` from Task 2.
- Produces: the final root entry point every external reference to `gubbins-spec.md` should still resolve against (its §1 anchor is preserved).

- [ ] **Step 1: Fill in the `docs/spec/README.md` index**

Add one row per file created in Tasks 2-4 (23 rows total) to the table, in the same order as the original `§3.1`-`§3.22` sequence, domain model first. Each row: `| <Title, without the 3.N prefix> | [<file>](<file>) |`.

- [ ] **Step 2: Rewrite root `gubbins-spec.md`**

Replace the entire file with:

```markdown
# Self-Hosted Wishlist — Requirements & Architecture Spec

An open source, privacy-focused, self-hosted wishlist and registry service.
A list owner publishes items; guests claim items or contribute money toward
group gifts and open funds. Designed for weddings, baby showers, birthdays,
and similar events.

**Full requirements:** [`docs/spec/`](docs/spec/README.md), one file per
topic. **Decisions:** [`docs/adr/`](docs/adr/README.md), one file per ADR.

## Design principles

1. **No accounts.** Access is by unguessable URL plus a shared key. Nobody registers to give or receive.
2. **No outbound requests at runtime** by default. No CDN, no analytics, no telemetry, no error reporting.
3. **The server is authoritative.** Business rules live server-side; clients ask rather than decide.
4. **YAGNI.** Complexity is added where it demonstrably pays (the ledger), not uniformly.
5. **Ten-minute setup.** A self-hosted project nobody can run is a project nobody uses.

## Non-goals

- No payment processing; the service never takes custody of funds
- No affiliate links
- No price tracking or monitoring (outbound-request privacy leak)
- No user accounts
- No social features, comments, or feeds
- No protection against a hostile server operator (they own the database)
```

This drops the old §1 status/changelog paragraphs (now redundant with the ADRs), §2 (moved to `docs/spec/domain-model.md`), §3 (moved to `docs/spec/*.md`), §4 (replaced by the `docs/adr/README.md` pointer above), and §5 (every open question it tracked is now `✅ Resolved` and cited from its resolving ADR/topic file — nothing left to track).

- [ ] **Step 3: Verify**

Run: `wc -l gubbins-spec.md` — expect ~25 lines (down from 2010).
Run: `grep -rn 'gubbins-spec.md#3\|gubbins-spec.md#4\|gubbins-spec.md#5' docs/ *.md 2>/dev/null` — this WILL still show hits inside `docs/adr/*.md` (Task 6 fixes those) but should show none inside the new `docs/spec/*.md` files (Tasks 3-4 already fixed those) or in `gubbins-spec.md` itself.

- [ ] **Step 4: Commit**

```bash
git add docs/spec/README.md gubbins-spec.md
git commit -m "docs: trim gubbins-spec.md to an entry point; complete docs/spec/ index"
```

---

### Task 6: Rewrite `gubbins-spec.md` cross-references across `docs/adr/*.md`

**Files:**
- Modify: every file in `docs/adr/*.md` that references `gubbins-spec.md#...` (confirmed count as of this plan's writing: 26 files plus `README.md` — re-run the grep below rather than trusting that count, since Tasks 1-5 don't touch these files but time may have passed).

**Interfaces:**
- Consumes: the anchor & cross-link mapping table above, and the now-final `docs/spec/*.md` filenames from Task 5.

- [ ] **Step 1: Find every reference**

Run: `grep -rln 'gubbins-spec.md#' docs/adr/`

- [ ] **Step 2: Rewrite each reference**

For every file found, replace each `../../gubbins-spec.md#<old-anchor>` with `../spec/<new-file>` per the mapping table (drop the `#anchor` suffix unless it's `#invariants`, which keeps its anchor: `../spec/domain-model.md#invariants`). Leave `../../gubbins-spec.md#1-overview` references unchanged — §1 still lives at that path.

- [ ] **Step 3: Verify**

Run: `grep -rn 'gubbins-spec.md#3\|gubbins-spec.md#4\|gubbins-spec.md#5' docs/adr/`
Expected: no output.
Run: `grep -rn 'gubbins-spec.md#1-overview' docs/adr/ | wc -l` — expect this count to be unchanged from before Step 2 (these were intentionally left alone).

- [ ] **Step 4: Commit**

```bash
git add docs/adr/
git commit -m "docs: repoint ADR cross-references from gubbins-spec.md sections to docs/spec/"
```

---

### Task 7: Verify spec split end-to-end

**Files:** none created; read-only verification task.

- [ ] **Step 1: Full repo link sweep**

Run: `grep -rn '](#\|](\.\./\.\./gubbins-spec\|](\.\./spec/\|](\.\./adr/' docs/ gubbins-spec.md`

For every match, manually confirm the target file exists (`ls <path>`) and, where a `#anchor` is present, that the anchor's heading exists in the target file.

- [ ] **Step 2: Confirm no orphaned old anchors**

Run: `grep -rn '#3[0-9]-\|#4-adr-index\|#5-open-questions' . --include='*.md' | grep -v docs/superpowers/`
Expected: no output (the `docs/superpowers/` exclusion covers this plan and the design spec, which legitimately discuss the old structure historically).

- [ ] **Step 3: Confirm file count**

Run: `ls docs/spec/*.md | wc -l` — expect 23 (22 topic files + `README.md`... adjust the glob if `README.md` is excluded, expect 24 including it).

No commit — this task only verifies Tasks 2-6; fix forward in those tasks' commits if something's wrong, don't create a separate fixup commit unless the plan is already merged.

---

### Task 8: Pilot merge — ADR-0022 into ADR-0069

**Files:**
- Modify: `docs/adr/0069-the-guest-key-travels-in-a-fragment.md` (full rewrite)
- Delete: `docs/adr/0022-guest-key-travels-in-the-invitation-url-transport.md`
- Modify: `docs/adr/README.md` (remove the 0022 row; update the 0069 row's title if needed)
- Modify: any `docs/spec/*.md` or `docs/adr/*.md` file with a remaining `0022` reference (found via grep in Step 1)

**Interfaces:**
- Consumes: current content of ADR-0022 and ADR-0069 (read before rewriting), Task 1's inventory row for 0022.
- Produces: the reference Nygard-merge example the follow-up rollout plan's merge-candidate tasks pattern-match against.

- [ ] **Step 1: Find every reference to ADR-0022**

Run: `grep -rln '0022-guest-key-travels-in-the-invitation-url-transport\|ADR-\[\?022\]\?' docs/ gubbins-spec.md`

- [ ] **Step 2: Rewrite `docs/adr/0069-the-guest-key-travels-in-a-fragment.md`**

Replace its full content with:

```markdown
# 0069. The guest key travels in a fragment

- **Status:** Accepted (supersedes 0022, merged into this entry)
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Context

Guests reach a list via an invitation link carrying a shared key, since most
arrive from a text message and won't reliably type a speakable key correctly
on a phone keyboard ([access & identity](../spec/access-identity.md)). The
key originally traveled as a query parameter (`?key=`): the server validated
it, set the session cookie, and issued a 302 redirect to strip it from the
address bar. That design knowingly left two exposures undisclosed as
unsolved: the browser's own history entry for the tapped link (unavoidable
client-side, the same limitation every password-reset link has), and
reverse-proxy/CDN access logs sitting outside the application's control —
mitigated only by documentation recommending query-string redaction at the
operator's proxy.

Making Cloudflare Tunnel the recommended deployment path
([governance, licensing & release](../spec/governance-licensing-and-release.md))
broke that mitigation: the key now reached Cloudflare's edge logs before the
redirect could strip it, and the operator has no way to configure redaction
there. The recommended deployment path became exactly the one where the
recommended mitigation was unavailable.

## Decision

The guest key travels in the URL fragment (`/{slug}#key=`), not the query
string, and is POSTed to the existing key-entry endpoint by a same-origin
script. Per RFC 3986, a fragment is interpreted solely by the agent
dereferencing the URI — it is never sent to a server, so it reaches no
proxy, edge, or access log. This closes the intermediary exposure the
query-string design could only document around; the application's own logs
already excluded the query string on this route, and the key is now a POST
body field the `pino` redact path also excludes.

This repurposes fragments from their specified use (identifying part of a
resource), but follows established precedent: OAuth 2.0's implicit flow
returned access tokens this way, and client-side-encrypted pastebins place
decryption keys there for the same reason — the closer analogy, being a
secret placed by the link's sender and read by a same-origin script. That
precedent was later deprecated by the OAuth 2.0 Security BCP for three
reasons, addressed in turn: browser-history exposure applies but is
identical under the query string and was already disclosed; referrer-header
leakage does not apply, since fragments are never sent in `Referer` (query
strings are, which argues for this change rather than against it); and
page-JavaScript exposure is neutralized by the strict CSP, absence of inline
scripts, and zero third-party origins already required by
[privacy](../spec/privacy.md). The remaining deprecation reasons (token
injection, absent sender-constraining) presuppose a redirect from a
third-party authorization server, which this flow has none of.

## Alternatives considered

- **Query string (`?key=`) with a server-side redirect to strip it** — the
  original decision (ADR-0022). Rejected once Cloudflare Tunnel became the
  recommended path: the key reaches Cloudflare's edge logs before the
  redirect runs, and the operator cannot configure redaction there. Its
  browser-history residue was already disclosed as unmitigable and carries
  forward unchanged.
- **"Short session lifetime" as a mitigation** — considered and withdrawn:
  if the key leaks from history or a log, whoever reads it enters it
  themselves and gets a fresh session, so the original guest's session
  expiring doesn't address the threat.

## Consequences

- Closes the reverse-proxy/edge-log exposure at every intermediary,
  including Cloudflare Tunnel, without operator configuration.
- Browser-history retention of the originally-tapped link remains a
  disclosed, unmitigable residual risk — identical under both designs, and
  unchanged by this decision.
- Adds a JavaScript dependency to an entry path that previously had none: a
  same-origin script now POSTs the fragment to the key-entry endpoint. This
  does not breach
  [accessibility & browser support](../spec/accessibility-and-browser-support.md)'s
  graceful-degradation requirement (which governs the hold/contribute flows
  specifically) — the fallback is the manual key-entry page that already
  exists for printed invitations.
- Key entry becomes a state-changing unauthenticated POST, needing
  `SameSite` and origin checking — a control the manual entry form already
  required.
- **Load-bearing dependency, stated explicitly:** this decision relies on
  the strict CSP, no inline scripts, and zero third-party origins
  ([privacy](../spec/privacy.md)) to neutralize page-JavaScript exposure. If
  a future change ever admits a third-party script, this decision degrades
  and should be revisited.
- Supersedes ADR-0022 in full; that decision's file is retired (content
  preserved in git history) since this Context section already carries its
  reasoning and its one open exposure.
```

- [ ] **Step 3: Delete ADR-0022**

```bash
git rm docs/adr/0022-guest-key-travels-in-the-invitation-url-transport.md
```

- [ ] **Step 4: Fix every remaining reference found in Step 1**

For each hit outside the two files above: if the sentence already cites both 0022 and 0069 together, drop the 0022 half; if it cites 0022 alone, repoint the link/mention to 0069. Re-read the surrounding sentence before editing — a couple of these (e.g. threat-model.md's mitigation table) state a fact that's still true and just needs its citation swapped, not its wording.

- [ ] **Step 5: Update `docs/adr/README.md`**

Remove the `| [022](...) | ... |` row. Confirm the `| [069](...) | ... |` row's title still reads correctly (it does — "The guest key travels in a fragment" needs no change).

- [ ] **Step 6: Verify**

Run: `grep -rln '0022-guest-key\|ADR-\[\?022\]\?' docs/ gubbins-spec.md`
Expected: no output.
Run: `ls docs/adr/0022* 2>&1` — expect "No such file or directory".

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: merge ADR-0022 into ADR-0069 (guest key transport), Nygard format"
```

---

### Task 9: Pilot renumber — 052a → 072

**Files:**
- Rename: `docs/adr/0052a-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md` → `docs/adr/0072-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md`
- Modify: `docs/adr/README.md` (numbering note + index row + drop the collision caveat)
- Modify: every file with a remaining `052a` reference (found via grep in Step 1)

**Interfaces:**
- Consumes: Task 1's inventory row for 0052a.

- [ ] **Step 1: Find every reference**

Run: `grep -rln '052a' docs/ gubbins-spec.md`

- [ ] **Step 2: Rename the file**

```bash
git mv docs/adr/0052a-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md docs/adr/0072-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md
```

Edit its first line from `# 0052a. revealedAt makes owner claim-status reveal one-way sticky` to `# 0072. revealedAt makes owner claim-status reveal one-way sticky`.

- [ ] **Step 3: Fix every other reference found in Step 1**

Replace `052a` with `072` and `0052a-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md` with `0072-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md` in each hit.

- [ ] **Step 4: Update `docs/adr/README.md`**

Move the 072 index row to numeric order (after 071). Remove the "Numbering note" paragraph about the 052/052a collision (or the parenthetical in the "Imported ADRs" section referencing it) — it's resolved, not just documented as resolvable.

- [ ] **Step 5: Verify**

Run: `grep -rln '052a' docs/ gubbins-spec.md`
Expected: no output.
Run: `ls docs/adr/0072*` — expect the renamed file.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: renumber ADR-052a to 072, resolving the numbering collision"
```

---

### Task 10: Pilot Nygard rewrite — ADR-0001 (short)

**Files:**
- Modify: `docs/adr/0001-no-accounts-slug-key-for-guests-owner-token-for-owners.md` (full rewrite)

**Interfaces:**
- Consumes: current 9-line content of ADR-0001 (Decision only, no Detail block — the shortest ADR in the corpus, chosen deliberately to show the pattern holds even with minimal source material).

- [ ] **Step 1: Rewrite the file**

Replace its full content with:

```markdown
# 0001. No accounts; slug + key for guests, owner token for owners

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Context

The project's first design principle ([overview](../../gubbins-spec.md#1-overview))
is that nobody registers to give or receive: guests claim items or
contribute without creating an account, and an owner runs their list
without one either. The service is aimed at a single event's worth of
casual, often one-time participants (a wedding or baby-shower guest list)
rather than returning users who'd benefit from a persistent identity, and
self-hosters want a ten-minute setup, not an accounts subsystem to operate.

## Decision

We will not build user accounts anywhere in the system. Guest access is an
unguessable slug (in the URL) plus a shared, human-readable key entered
once; owner access is a single shared owner token per list, with no
per-owner identity underneath it. Both are bearer secrets — whoever holds
one has full access at that level.

## Alternatives considered

- **Per-guest accounts (registration/login)** — rejected: adds signup
  friction contrary to the no-accounts design principle, and a wedding or
  baby-shower guest list has no ongoing use for a persistent guest identity.
- **Per-owner accounts (username/password or SSO)** — rejected: a list has
  no need for multiple distinguishable owner identities (co-owners share
  one token, ADR-[0015](0015-owner-tokens-are-shared-per-list-not-per-owner.md)),
  so individual login credentials would add an accounts subsystem to
  build, secure, and operate without an accountability benefit to attach
  it to.

## Consequences

- No password resets, no user database, no per-person session state
  anywhere in the system.
- Access control is entirely secret-possession-based: anyone holding the
  slug+key or the owner token has full access at that level. Protecting
  those secrets in transit and storage becomes its own line of decisions
  (ADR-[0064](0064-the-owner-token-never-travels-in-a-url.md): owner token
  never travels in a URL; ADR-[0069](0069-the-guest-key-travels-in-a-fragment.md):
  guest key travels in a fragment; ADR-[0054](0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md):
  guest key stored in plaintext).
- No durable cross-session guest identity exists, which later decisions
  must design around rather than assume — e.g. ADR-[0060](0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)'s
  guest self-service data access is scoped per session, not per person,
  because there is no "per person" to scope to.
```

- [ ] **Step 2: Verify**

Run: `grep -c '^## ' docs/adr/0001-no-accounts-slug-key-for-guests-owner-token-for-owners.md` — expect 4 (Context, Decision, Alternatives considered, Consequences).

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0001-no-accounts-slug-key-for-guests-owner-token-for-owners.md
git commit -m "docs: rewrite ADR-0001 to Nygard format"
```

---

### Task 11: Pilot Nygard rewrite — ADR-0070 (long)

**Files:**
- Modify: `docs/adr/0070-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md` (full rewrite)

**Interfaces:**
- Consumes: current 117-line content of ADR-0070 (Decision + Detail + two dated addenda — the longest ADR in the corpus, chosen to show the pattern holds at the other size extreme, including how to fold later-added implementation notes into Consequences rather than a fifth section).

- [ ] **Step 1: Rewrite the file**

Replace its full content with:

```markdown
# 0070. Devcontainer sandboxes Claude Code `auto` mode via an egress-proxy sidecar

- **Status:** Accepted
- **Date:** Not recorded (imported from `gubbins-pending-changeset.md`)
- **Deciders:** Not recorded

## Context

The project runs Claude Code in `auto` permission mode inside the
devcontainer, where a safety classifier — not a human — approves some
actions before they execute. Anthropic states the classifier is not a
complete safety boundary on its own, and a coding agent reading untrusted
input (fetched pages, issue text, file content) remains a live
prompt-injection target regardless of classifier accuracy.
`bypassPermissions` (`--dangerously-skip-permissions`) is explicitly out of
scope and is not enabled anywhere in this project's tooling. A
network-level sandbox is therefore needed as an independent layer beneath
the classifier — bounding the damage on the occasions the classifier is
wrong, rather than trying to make the classifier itself more reliable.

## Decision

`auto`-mode Claude Code runs in the devcontainer behind an `egress-proxy`
sidecar on a Docker network marked `internal: true`, which removes any
route out of the `app` container regardless of what a classifier-approved
command attempts. The single-purpose `egress-proxy` container is the only
bridge to the internet; `app` reaches it via `HTTP_PROXY`/`HTTPS_PROXY`.
The proxy enforces a domain/SNI-based allowlist — `registry.npmjs.org`
(npm); `github.com`, `api.github.com`, `codeload.github.com`,
`objects.githubusercontent.com`, `raw.githubusercontent.com` (GitHub); and
`api.anthropic.com` — HTTPS only, port 443 only; an allowlisted domain does
not imply an allowlisted arbitrary port. This project's own Codeberg remote
is deliberately excluded: an `auto`-mode session is expected to work
locally and have a human push, not to have a path from the sandboxed agent
to the project's own repository. `app` carries zero `NET_ADMIN`/`NET_RAW`
or other elevated network capabilities.

## Alternatives considered

- **In-container `iptables`/`ipset`** (the pattern used by Anthropic's own
  reference devcontainer firewall script, resolving allowed domains to IPs
  and periodically refreshing the set) — rejected: it chases a moving
  target (IP rotation, CDN churn) requiring ongoing allowlist maintenance,
  and it needs `NET_ADMIN`/`NET_RAW` on the very container running
  unattended AI-driven command execution — the container least suited to
  holding a network-manipulation privilege. A hostname/SNI-based proxy
  needs no IP resolution at all, and confines the elevated capability to a
  small, static, non-agentic proxy container instead.
- **`bypassPermissions` under either firewall design** — considered and
  rejected outright: removing per-action judgment entirely is a different
  risk posture that no network control substitutes for.
- **Codeberg on the allowlist** — rejected: unnecessary for local
  write-and-test work, and an avoidable increase in blast radius.
- **An allowlist with no network-topology isolation** (proxy env vars
  alone, without `internal: true`) — rejected: leaves a bypass open if
  something in `app` ignores the proxy environment variables and dials out
  directly; `internal: true` makes that structurally impossible rather than
  policy-enforced.

## Consequences

- Devcontainer/CI concern only; has no bearing on the production app's "no
  outbound anything by default" runtime behavior ([ops](../spec/ops.md)).
- The proxy is Squid (`ubuntu/squid`, pinned to Canonical's current
  `latest`/`edge`-aligned build — the tag namespace has no long-lived
  stable alias, so the pin needs periodic re-checking, not a one-time fix).
- **Follow-up work required to keep this running**, discovered during
  initial build-out:
  - Squid daemonizes by default (forks to background, exits its foreground
    process). In a container that foreground exit is PID 1 exiting,
    tearing the container down right after an apparently clean startup —
    fixed with the `-N` (no-daemonize) flag.
  - `access_log`/`cache_log` cannot point directly at `/dev/stdout`: Squid
    opens them via its own `file_open()`, and the unprivileged user it
    drops to can't reopen the container's inherited stdout pipe that way.
    Both directives point at real files under `/var/log/squid/` instead;
    the image's entrypoint tails them to stdout itself.
  - Capability set, empirically confirmed rather than assumed:
    `cap_drop: ALL` plus `cap_add: [SETUID, SETGID]` is sufficient and
    necessary — Squid starts as root and drops privilege internally as
    part of its own security design. `app` carries no added capabilities
    at all.
- **Revisited, not reversed:** partway through implementation, a survey of
  public Claude Code devcontainer reference setups (including Anthropic's
  own) found `iptables`/`ipset` to be the prevailing pattern for this
  problem, not a forward proxy. That was treated as a genuine prompt to
  reconsider. The decision to continue with the proxy design stands, on
  the original grounds above — but the proxy path took substantially more
  implementation effort to get working than the prevailing approach would
  have, which is a real cost worth weighing if this decision is ever
  revisited.
```

- [ ] **Step 2: Verify**

Run: `grep -c '^## ' docs/adr/0070-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md` — expect 4.
Manually diff against the original (available via `git show HEAD:docs/adr/0070-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md`) to confirm nothing substantive was dropped: the allowlist domains, the three implementation gotchas, and the "revisited not reversed" note must all still be present somewhere.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0070-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md
git commit -m "docs: rewrite ADR-0070 to Nygard format"
```

---

### Task 12: Final pilot verification and stop for review

**Files:** none created; read-only verification task.

- [ ] **Step 1: Repo-wide link sweep**

Run: `grep -rn '](#\|](\.\./\.\./gubbins-spec\|](\.\./spec/\|](\.\./adr/\|](docs/' docs/ gubbins-spec.md`

For every match, confirm the target file exists and any `#anchor` resolves.

- [ ] **Step 2: Confirm no dangling references to retired/renumbered ADRs**

Run: `grep -rln '0022-guest-key\|052a' . --include='*.md' | grep -v docs/superpowers/`
Expected: no output.

- [ ] **Step 3: Update `docs/adr/README.md` status column for touched ADRs**

Confirm the 0001, 0069, and 0072 rows in the index table are accurate (title, status). Confirm the 0022 row is gone.

- [ ] **Step 4: Commit any fixes found in Steps 1-3**

```bash
git add -A
git commit -m "docs: fix cross-references found in pilot verification"
```
(Only if Steps 1-3 found something to fix — otherwise skip this commit.)

- [ ] **Step 5: STOP — do not proceed to a rollout plan**

This plan's scope ends here. Summarize for the user: what `docs/spec/` now looks like, the three ADR pilots (0001 rewrite, 0070 rewrite, 0022+0069 merge, 052a→072 renumber), and point them at
`docs/superpowers/specs/2026-09-11-adr-inventory.md` (Task 1's output). The
rollout of the validated pattern to the remaining ~65 ADRs is a **separate
plan**, written via `superpowers:writing-plans` against that inventory,
once the user has reviewed this pilot's diffs.

---

## Self-Review Notes

- **Spec coverage:** every section of the design spec maps to a task —
  target structure (Tasks 2-7), Nygard rewrite pattern (Tasks 10-11),
  redundancy cleanup rules 1-3 (Tasks 8-9), verification (Tasks 7, 12).
  The design spec's "Rollout" step is explicitly out of scope here (see
  Task 12, Step 5) and left to a follow-up plan, per the Scope Check in
  `writing-plans`.
- **Placeholder scan:** the only steps that don't contain literal final
  content are the mechanical extraction steps (Tasks 3, 4, 6, and Task 1's
  remaining 68 classifications) — each of those specifies an exact,
  unambiguous source (line ranges or a grep pattern) rather than asking
  for judgment-free content to be invented, which is the distinction the
  "No Placeholders" rule is drawing.
- **Type/name consistency:** file paths introduced in Task 2 (`domain-model.md`)
  and Tasks 3-4 (the 22 topic files) are the same paths Tasks 5, 6, 8, 10,
  and 11 link against — cross-checked against the anchor mapping table,
  which is the single source of truth for every filename used across all
  12 tasks.
