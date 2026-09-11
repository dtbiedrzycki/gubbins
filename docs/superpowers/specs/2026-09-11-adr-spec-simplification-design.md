# ADR & spec simplification — design

**Status:** Draft
**Branch:** `docs/adr-spec-simplify` (off `docs/adr-restructure`)
**Date:** 2026-09-11

## Purpose

`gubbins-spec.md` (2010 lines) and `docs/adr/` (72 ADRs) document a
self-hosted wishlist app's requirements and decisions. Both were built
incrementally as a decision journal and it shows: the spec carries ~1300
lines of now-resolved "open questions" narrative, and every ADR was
imported as a dense `Decision` + prose `Detail` block rather than the
Nygard template (`docs/adr/0000-adr-template.md`) the repo already
commits to. Some ADRs are redundant (one supersedes another but still
reads `Accepted`) or collide (052/052a).

Goal: make both documents short, structurally consistent, and easy for
a human or an AI agent to consume selectively — without losing any
decision or its rationale. This is a documentation restructuring, not a
change to the underlying product decisions. The restructured docs are
also the source material a future `writing-plans` pass will use to
implement the app itself, in end-to-end vertical slices; this pass
organizes the *reference material* by topic (mirroring how the spec
already groups requirements) and deliberately leaves slice boundaries
to that future planning pass, which has information (build order,
dependencies) this pass doesn't.

## Non-goals

- No product/architecture decisions change. Content is reorganized and
  condensed, not reversed or reinterpreted.
- No pre-built mapping from doc sections to future implementation
  slices — that's a `writing-plans`-time decision.
- No renumbering of ADRs beyond what's needed to resolve the 052/052a
  collision and any merges found during inventory (see below) — stable
  numbers are cheap for humans and diffs; only touch what's actually
  broken.

## Target structure

### `docs/spec/`

New directory, split 1:1 from `gubbins-spec.md`'s existing headings —
the same move already made for ADRs (`docs/adr/`):

- `docs/spec/README.md` — index (mirrors `docs/adr/README.md`): one
  line per file, pointing at the relevant ADRs.
- `docs/spec/domain-model.md` — current §2.
- `docs/spec/<slug>.md` × 22 — one per current §3.x subsection (access
  & identity, names, holds, group gifts & funds, payments, manual
  contributions, privacy, data & persistence, backend architecture,
  front-end architecture, ops, development environment, testing, owner
  dashboard & editing rules, guest UX, accessibility & browser support,
  performance & resource budget, backup/restore/upgrade, observability,
  governance/licensing/release, threat model, time/timezones).

Root `gubbins-spec.md` becomes a short entry point: §1 (Overview,
design principles, non-goals) plus pointers to `docs/spec/` and
`docs/adr/`. Current §4 (ADR index pointer) and §5 (Open Questions
journal, ~1300 lines) are dropped — every decision they narrate is
already recorded, with better rationale, in the corresponding ADR.

### `docs/adr/` — Nygard rewrite

Every ADR is rewritten to the template's four sections:

- **Context** — the forcing situation, pulled from the existing prose
  (often the first paragraph of `Detail`).
- **Decision** — one crisp "We will …" statement. Caveats and edge
  cases currently jammed into the Decision line move to Context or
  Consequences.
- **Alternatives considered** — options already named as rejected
  inline (most ADRs have these; they're just not bulleted out today).
- **Consequences** — tradeoffs, follow-up work, and revisit triggers
  (many ADRs already end with one, e.g. ADR-034's `PURGE_AFTER_DAYS`
  trigger — these get promoted into the section, not paraphrased).

Where an ADR is superseded, the supersession line stays terse
(`Status: Superseded by NNNN`); the "what changed and why" narrative
moves into the *superseding* ADR's Context rather than living in both
files.

### Redundancy cleanup

Rules, applied during the inventory pass:

1. **Stale status** — where an ADR's own prose says it's superseded
   (e.g. ADR-022's title: "transport superseded by 069") but `Status`
   still reads `Accepted`, fix the status *and* fold the pair into one
   file when they describe what's now really a single current
   decision (see Merge, below). Fold rather than just relabel when the
   superseded file would otherwise be near-empty of independent value.
2. **Merge near-duplicates** — when two ADRs together describe one
   decision (022 + 069: guest-key transport), rewrite the surviving
   number as a single Nygard ADR whose Context includes the earlier
   rejected approach, and delete the other file outright. No tombstone
   stub — git history is the record, matching how the repo already
   treats ADRs as an append-only log at the git level, not the
   filesystem level.
3. **Numbering collisions** — 052/052a is the one known case. Give
   052a a clean unused number (072) rather than cascading a renumber
   through 052-071, and update every cross-reference.

**Known findings so far** (from initial reading, not yet a full
inventory):

| ADRs | Finding | Action |
|------|---------|--------|
| 022, 069 | Same decision (guest-key transport); 022 reads `Accepted` but is superseded in substance | Merge into 069, delete 022 |
| 052, 052a | Numbering collision, flagged unresolved in README | Renumber 052a → 072 |
| 034 | Says `Accepted`, is accurate (deferral upheld, not superseded) — partial cross-reference to 059/067 is fine as Context material | Reformat only |
| 038 | Already minimal and correctly `Superseded by 040` | Reformat only (verify it already matches target shape) |

The remaining ~65 ADRs have not yet been individually classified. The
implementation plan's first step is a full inventory pass (read all 72,
classify each as reformat-only / merge-candidate / status-fix) so the
rollout has a checklist instead of discovering candidates file-by-file
mid-rewrite.

## Sequencing

1. **Inventory** — classify all 72 ADRs per the rules above; record as
   a checklist.
2. **Pilot** (shown to the user before continuing):
   - `gubbins-spec.md` → `docs/spec/` split and trim, in full.
   - ADR-022 + ADR-069 merge (validates the merge mechanics).
   - 052 → 072 renumber (validates the renumber + cross-reference
     update mechanics).
   - Nygard rewrite of one long ADR (e.g. 059 or 070) and one short one
     (validates the rewrite pattern at both ends of the size range).
3. **Rollout** — apply the validated pattern to the remaining ADRs
   (likely dispatched across subagents given the volume — a detail for
   the implementation plan), update `docs/adr/README.md`'s index and
   status column, and remove the numbering-collision note once 072 is
   assigned.
4. **Verification** — grep every `ADR-NNN` / `docs/adr/NNNN-...` /
   `gubbins-spec.md#...` cross-reference across `docs/spec/`,
   `docs/adr/`, and root `gubbins-spec.md`; confirm each resolves to a
   file and section that still exists after the merges/renumber/split.

## Risks

- **Merge loses nuance** — folding 022 into 069 could drop a
  distinction that mattered. Mitigation: the merged ADR's Context
  explicitly carries the rejected/superseded approach and why it
  changed, not just the final state.
- **Cross-reference breakage** — the spec and ADRs link each other
  heavily (`§3.x`, `ADR-NNN`). Mitigation: the verification step is a
  mechanical grep pass, run after every batch, not just at the end.
- **Over-fragmentation** — 22 spec files + 72 ADRs is a lot of files.
  Mitigation: this mirrors a pattern the repo already adopted
  successfully for ADRs; the index files (`docs/spec/README.md`,
  `docs/adr/README.md`) keep it navigable.

## Handoff

Next step: `writing-plans`, to turn steps 1-4 above into a concrete
implementation plan (batch sizes, subagent dispatch for the rollout,
commit structure).
