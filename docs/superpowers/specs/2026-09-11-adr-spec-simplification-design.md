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
reads `Accepted`); the 052/052a collision has been resolved by renumbering
052a to 072.

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

1. **Superseded ADRs are always folded, never left standing.** Whenever
   an ADR's `Status` already reads `Superseded by NNNN`, or its own
   prose says it's superseded even though `Status` hasn't caught up
   (e.g. ADR-022's title: "transport superseded by 069"), it is folded
   into the superseding ADR — its unique rationale, if any, merged into
   that ADR's Context or Consequences — and its file is deleted.
   **No ADR may end this work with a `Superseded by` status still on
   disk.** This is a hard requirement, not a judgment call per file.
2. **Merge near-duplicates** — when two ADRs together describe one
   decision (022 + 069: guest-key transport), rewrite the surviving
   number as a single Nygard ADR whose Context includes the earlier
   rejected approach, and delete the other file outright. No tombstone
   stub — git history is the record, matching how the repo already
   treats ADRs as an append-only log at the git level, not the
   filesystem level.
3. **Numbering collisions and gaps** — the 052/052a collision (052a
   renumbered to 072) has been resolved; every fold in rules 1-2 also leaves a gap where the
   deleted file used to be. Because this restructuring is the **first
   pass** — the baseline every future ADR builds on, not an interim
   edit that preserves historical numbers for their own sake — the
   plan does not just patch the known collision and leave the rest of
   the gaps standing. Once every fold across the full corpus is known
   (i.e. after the rollout plan completes), a single terminal
   renumbering task walks the survivors in order and renumbers them
   0001..N with no gaps, rewriting every cross-reference
   repository-wide. Interim renumbers performed before that point
   (e.g. the pilot's 052a renumber) are real, permanent fixes to their
   specific collision — not wasted work — but are not the final
   numbers; the terminal pass may move them again when it closes the
   remaining gaps.

**Known findings so far** (from initial reading, not yet a full
inventory):

| ADRs | Finding | Action |
|------|---------|--------|
| 022, 069 | Same decision (guest-key transport); 022 reads `Accepted` but is superseded in substance | Merge into 069, delete 022 |
| 052, 072 | Numbering collision resolved | 052a renumbered → 072 |
| 034 | Says `Accepted`, is accurate (deferral upheld, not superseded) — partial cross-reference to 059/067 is fine as Context material | Reformat only |
| 038 | Formally `Superseded by 040`; carries no rationale beyond what 040's Detail already states | Fold into 040, delete 038 |

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
   - ADR-038 folded into ADR-040 (validates the "fold a superseded ADR,
     leave no file behind" mechanics, distinct from a near-duplicate
     merge — 038 has no independent content to preserve).
   - 052 → 072 renumber (validates the renumber + cross-reference
     update mechanics).
   - Nygard rewrite of one long ADR (e.g. 059 or 070) and one short one
     (validates the rewrite pattern at both ends of the size range).
   - I'll show you diffs before rolling the same pattern out to the
     remaining ~65 files.
3. **Rollout** — apply the validated pattern to the remaining ADRs
   (likely dispatched across subagents given the volume — a detail for
   the implementation plan), fold every other ADR the inventory finds
   superseded (rule 1 — none may remain), update `docs/adr/README.md`'s
   index and status column accordingly.
4. **Terminal renumbering** — once every fold across the whole corpus
   is done, one final pass walks the survivors in order, renumbers them
   0001..N with no gaps, and rewrites every cross-reference in
   `docs/adr/`, `docs/spec/`, and `gubbins-spec.md` to match. This is
   what makes the result of this work the stable, permanent numbering
   baseline — not another interim state.
5. **Verification** — grep every `ADR-NNN` / `docs/adr/NNNN-...` /
   `gubbins-spec.md#...` cross-reference across `docs/spec/`,
   `docs/adr/`, and root `gubbins-spec.md`; confirm each resolves to a
   file and section that still exists after the merges/renumber/split,
   and confirm zero files remain with `Status: Superseded by NNNN`.

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

Next step: `writing-plans`, to turn steps 1-5 above into a concrete
implementation plan. Given the corpus size, this becomes two plans:
a **pilot plan** (inventory + spec split + a small ADR pilot batch,
including one fold-a-superseded-ADR example and one collision-renumber
example) reviewed before continuing, and a **rollout plan** (written
against the pilot's completed inventory) that folds every remaining
superseded ADR and ends with the terminal renumbering pass.
