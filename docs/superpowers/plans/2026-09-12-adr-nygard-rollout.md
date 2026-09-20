# ADR Nygard Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the remaining 66 un-rewritten ADRs under `docs/adr/` to the Nygard template (`docs/adr/0000-adr-template.md`), close the two open pre-existing-issue items flagged during the pilot, and finish with a terminal renumbering pass that leaves `docs/adr/` as `0001..0070` with no gaps and no stale cross-references.

**Architecture:** This is a documentation-restructuring plan, not a code change. There are no unit tests; "tests" are (a) a link/anchor checker script run after every batch and (b) structural greps (section-heading shape, `Superseded by` residue, `§[` label residue, "We will" openings) that make each task's deliverable mechanically verifiable instead of eyeballed. The 66 files are rewritten in 9 topic-grouped batches so each task stays reviewable independently; the terminal renumbering runs once, last, after every batch has landed — per the design doc, it cannot run earlier because the final survivor list (used to compute the gap-free numbering) isn't known until all 66 rewrites are confirmed to introduce no new merges (the pilot's inventory already confirmed this: exactly 0022 and 0038 were merge-candidates, both already folded).

**Tech Stack:** Markdown, Python 3 (link-checker and renumbering scripts — no third-party dependencies), git.

**Spec:** `docs/superpowers/specs/2026-09-11-adr-spec-simplification-design.md` (especially "Rollout readiness") and `docs/superpowers/specs/2026-09-11-adr-inventory.md` (full 72-row classification). This plan argues from both; executors should have them open.

**Branch:** `docs/adr-rollout`, created off `docs/adr-spec-simplify` (the pilot branch — PR #2 is open but mergeable and is a clean fast-forward of `docs/adr-restructure`, so this is equivalent to branching off `docs/adr-restructure` post-merge, and is the branch that actually contains the pilot's Nygard-rewritten 0001/0040/0069/0070, the 0022→0069 and 0038→0040 folds, the 0052a→0072 renumber, and the `docs/spec/` split this plan builds on).

## Global Constraints

These apply to every ADR rewritten in this plan (Tasks 3–11). Restated once here rather than per-task, per the pilot's established conventions (design doc, "Rollout readiness"):

- **Section order:** `Context` / `Decision` / `Alternatives considered` / `Consequences`, exactly matching `docs/adr/0000-adr-template.md`. No other headings, no `Detail` block left behind.
- **Decision voice:** the Decision section opens with "We will …" (house style, retrofitted onto all 4 pilot rewrites — see 0040/0069/0070).
- **ADR-to-ADR citation:** `ADR-[NNN](./NNNN-slug.md)` from another ADR file, `ADR-[NNN](../adr/NNNN-slug.md)` from a spec file — 3-digit bracket label, 4-digit path number, same slug as the target file's current filename.
- **ADR-to-spec citation:** `[label](../spec/topic.md)` — lowercase, descriptive label. Never `§[3.N](...)`. This is also **the fix for the stale-label residue**: every `§[3.N](../spec/topic.md)`-style link in a file this plan touches must become `[descriptive label](../spec/topic.md)` as part of that file's rewrite (68 occurrences across the 66 files per the current-state grep below — fold into the rewrite, don't do it as a separate pass, matching how the pilot deliberately deferred this rather than touching each file twice).
- **Status/Date/Deciders lines do not change** during a reformat-only rewrite. All 66 files already carry `Status: Accepted`, a real `Date`, and `Deciders: dtbiedrzycki` — leave them as-is unless Global Constraint below says otherwise.
- **Partial-supersession / amendment nuance is Context or Consequences material, never a Status change.** ADRs 0020, 0034, 0044, 0049, 0058, 0059, 0061, 0062, 0066, 0072 are each amended or partially superseded by a later ADR per the inventory's classification reasoning, but the decision core in each stands — `Status: Accepted` is correct and must not become `Superseded by NNNN`. (Only 0022 and 0038 were full supersessions, and both are already gone.)
- **No content loss.** Every unique fact currently in a file's `Detail` block (rejected alternatives, follow-up triggers, cross-references) must land somewhere in the rewritten four sections — condense prose, don't drop rationale.
- **Numbers don't move yet.** Filenames and H1 headers (`# NNNN. Title`) keep their current number through Tasks 3–11. Renumbering is Task 12 only, run once against the fully-rewritten corpus.
- **One commit per batch task**, covering all files touched in that task.

## File Structure

- Create: `scripts/check_adr_links.py` — resolves every relative markdown link and `#anchor` under `docs/adr/`, `docs/spec/`, and root `gubbins-spec.md` against real files/headings; exits non-zero on any break. Run after every batch task and in final verification.
- Create: `scripts/renumber_adrs.py` — Task 12 only. Computes the gap-closing renumbering map, `git mv`s files, and rewrites every cross-reference form found in the corpus.
- Modify: 66 files under `docs/adr/` (listed per batch in Tasks 3–11).
- Modify: `docs/adr/README.md` (Task 2: stale "Numbering" wording; Task 12: index table + "Imported ADRs" section after renumbering).
- Modify: `docs/spec/README.md`, rename `docs/spec/threat-model.md` → `docs/spec/threat-model-summary.md` (Task 2).

---

## Task 1: Link/anchor checker script

**Files:**
- Create: `scripts/check_adr_links.py`
- Test: exercised inline against a scratch fixture (Step 2) and against the real corpus (Step 4) — no separate test file needed for a standalone verification script.

**Interfaces:**
- Produces: a CLI, `python3 scripts/check_adr_links.py [paths...]` (defaults to `docs/adr docs/spec gubbins-spec.md` when no paths given). Exit code 0 = all links resolve, 1 = at least one broken link (printed one per line as `SOURCE_FILE: BROKEN_LINK (reason)`). Every later task's verification step invokes this exact command.

- [ ] **Step 1: Write the script**

```python
#!/usr/bin/env python3
"""Resolve every relative markdown link and #anchor under the given paths
against real files and real headings. Exits 1 if any link is broken."""
import re
import sys
from pathlib import Path

LINK_RE = re.compile(r'\[[^\]]*\]\(([^)\s]+)\)')
HEADING_RE = re.compile(r'^(#{1,6})\s+(.*)$', re.MULTILINE)


def slugify(heading: str) -> str:
    # GitHub-style heading slug: lowercase, strip non-word/space/hyphen,
    # spaces -> hyphens.
    s = heading.strip().lower()
    s = re.sub(r'[^\w\s-]', '', s)
    s = re.sub(r'\s+', '-', s)
    return s


def headings_for(path: Path) -> set[str]:
    text = path.read_text(encoding='utf-8')
    slugs = []
    seen = {}
    for _, heading in HEADING_RE.findall(text):
        base = slugify(heading)
        n = seen.get(base, 0)
        seen[base] = n + 1
        slugs.append(base if n == 0 else f'{base}-{n}')
    return set(slugs)


def iter_markdown_files(paths: list[str]) -> list[Path]:
    files = []
    for p in paths:
        path = Path(p)
        if path.is_dir():
            files.extend(sorted(path.rglob('*.md')))
        elif path.is_file():
            files.append(path)
    return files


def check(paths: list[str]) -> list[str]:
    errors = []
    files = iter_markdown_files(paths)
    for md_file in files:
        text = md_file.read_text(encoding='utf-8')
        for target in LINK_RE.findall(text):
            if target.startswith(('http://', 'https://', 'mailto:')):
                continue
            file_part, _, anchor = target.partition('#')
            if file_part == '':
                # Same-file anchor.
                resolved = md_file
            else:
                resolved = (md_file.parent / file_part).resolve()
            if not resolved.exists():
                errors.append(f'{md_file}: {target} (file not found: {resolved})')
                continue
            if anchor:
                slugs = headings_for(resolved)
                if anchor not in slugs:
                    errors.append(
                        f'{md_file}: {target} (anchor #{anchor} not found in {resolved})'
                    )
    return errors


def main() -> int:
    paths = sys.argv[1:] or ['docs/adr', 'docs/spec', 'gubbins-spec.md']
    errors = check(paths)
    for e in errors:
        print(e)
    if errors:
        print(f'{len(errors)} broken link(s)')
        return 1
    print('All links resolve.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
```

- [ ] **Step 2: Prove it catches a broken link (fixture test)**

```bash
mkdir -p /tmp/adr-link-fixture
cat > /tmp/adr-link-fixture/a.md <<'EOF'
# A

See [B](./b.md#missing-anchor) and [ghost](./ghost.md).

## Real Section
EOF
cat > /tmp/adr-link-fixture/b.md <<'EOF'
# B

## Real Section
EOF
python3 scripts/check_adr_links.py /tmp/adr-link-fixture
echo "exit: $?"
```

Expected: two errors printed (`ghost.md` file-not-found, `#missing-anchor` not found), `exit: 1`.

- [ ] **Step 3: Prove it passes on a clean fixture**

```bash
cat > /tmp/adr-link-fixture/a.md <<'EOF'
# A

See [B](./b.md#real-section).
EOF
python3 scripts/check_adr_links.py /tmp/adr-link-fixture
echo "exit: $?"
rm -rf /tmp/adr-link-fixture
```

Expected: `All links resolve.`, `exit: 0`.

- [ ] **Step 4: Run against the real corpus (baseline)**

```bash
python3 scripts/check_adr_links.py
```

Expected: `All links resolve.` — the pilot's own final review already verified this corpus by hand; this run confirms the script agrees with that baseline before it's trusted for the batches that follow. If it reports anything, stop and fix the pre-existing link before continuing (it means the hand-verification missed something).

- [ ] **Step 5: Commit**

```bash
git add scripts/check_adr_links.py
git commit -m "docs(tooling): add ADR/spec link and anchor checker

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018kTuwdPr7uZEkVEXJgtcN9"
```

---

## Task 2: Pre-existing-issue cleanup (README wording, threat-model naming collision)

Addresses two of the five "pre-existing issues" from the rollout-readiness addendum that aren't tied to any single ADR's rewrite (the third, ADR-0020's stale `revealAfter` wording, is folded into Task 4 where 0020 itself is rewritten).

**Files:**
- Modify: `docs/adr/README.md`
- Modify: `docs/spec/README.md`
- Rename: `docs/spec/threat-model.md` → `docs/spec/threat-model-summary.md`

**Interfaces:** none (no other task depends on this task's output beyond the renamed file existing).

- [ ] **Step 1: Fix the stale "Numbering" section wording**

In `docs/adr/README.md`, the "Numbering" section currently reads (as of the pilot):

```
The numbering scheme (including the starting number and whether earlier
decisions get backfilled) is **not settled yet** — some decisions
predate this repository and will be imported later. Until then, agree a
number on the PR that introduces an ADR.
```

This is stale: the import already happened (0001–0072, now being renumbered to a gap-free 0001–0070 by this same rollout). Replace it with:

```
ADRs are numbered `0001..N` with no gaps. New ADRs take the next free
number; folding or superseding an ADR does not free its number for
reuse (see "An accepted ADR is immutable" above) except during the
one-time renumbering documented in the restructuring history.
```

- [ ] **Step 2: Resolve the `docs/threat-model.md` naming near-collision**

`docs/spec/threat-model.md` (the spec summary) states it is a summary of
`docs/threat-model.md` (the full, not-yet-written threat model document
referenced by ADR-0035 as authoritative). One path apart is a confusing
near-collision waiting to happen the day someone creates the real file.
Rename now, while it's cheap:

```bash
git mv docs/spec/threat-model.md docs/spec/threat-model-summary.md
```

Update the one internal reference inside the renamed file — its own
first paragraph currently reads "Full threat model ... lives in
`docs/threat-model.md`. Summary below": leave that sentence as-is (it
correctly points at the *other*, not-yet-written file), but nothing else
in the file names itself, so no self-reference needs fixing.

- [ ] **Step 3: Update the one cross-reference to the renamed file**

In `docs/spec/README.md`, change:

```
| Threat model | [threat-model.md](threat-model.md) |
```

to:

```
| Threat model | [threat-model-summary.md](threat-model-summary.md) |
```

- [ ] **Step 4: Verify no other references to the old path remain**

```bash
grep -rn "spec/threat-model.md\](threat-model.md)\|](threat-model\.md)" docs/spec/ docs/adr/ gubbins-spec.md
```

Expected: no output (the only reference was the one just fixed; ADR-0035
and the file's own body correctly reference `docs/threat-model.md`, a
different path, which must NOT be touched).

- [ ] **Step 5: Run the link checker**

```bash
python3 scripts/check_adr_links.py
```

Expected: `All links resolve.`

- [ ] **Step 6: Commit**

```bash
git add docs/adr/README.md docs/spec/README.md docs/spec/threat-model-summary.md
git commit -m "docs: fix stale numbering wording; rename threat-model summary to avoid path collision

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018kTuwdPr7uZEkVEXJgtcN9"
```

---

## Batch rewrite tasks (Tasks 3–11)

Each batch task follows the same shape. For every file listed:

1. Read the file in full (each still has its old `Decision` + optional
   `Detail` single-block format — the plan does not restate their prose
   here; that prose is the Context/Alternatives/Consequences source
   material).
2. Rewrite to the four Nygard sections per Global Constraints above:
   - **Context** — the forcing situation. Usually the first part of the
     old `Detail` paragraph, or (for files with no `Detail` block) a
     sentence or two synthesized from the Decision line itself plus its
     linked spec topic.
   - **Decision** — one crisp "We will …" statement, edge cases moved out.
   - **Alternatives considered** — bullet every option the old `Detail`
     names as rejected, each with its rejection reason.
   - **Consequences** — tradeoffs, follow-up triggers, cross-references
     to other ADRs/spec topics that were previously just inline prose.
3. Convert every `§[3.N](../spec/topic.md)` link in that file to
   `[descriptive label](../spec/topic.md)`.
4. Where a file has a per-file note below, apply it — these carry
   inventory nuance an executor working file-by-file wouldn't otherwise
   have, and exist specifically so nuance isn't re-derived per file.

After all files in the batch are rewritten:

- [ ] Run `python3 scripts/check_adr_links.py` — expect `All links resolve.`
- [ ] Run `grep -n '§\[' <each file in this batch>` — expect no output.
- [ ] Run `grep -n '^## ' <each file in this batch>` for each file and
  confirm the four headings are exactly `Context`, `Decision`,
  `Alternatives considered`, `Consequences`, in that order, with no
  `Detail` heading remaining.
- [ ] Run `grep -A1 '^## Decision' <each file>` and confirm the line
  after the heading starts with "We will".
- [ ] Commit all files in the batch together.

Per-file notes below are sourced from `docs/superpowers/specs/2026-09-11-adr-inventory.md`'s Notes column and the design doc; consult those documents for any file where more context is wanted than the note gives.

### Task 3: Batch 1 — ledger/event-sourcing foundations (0002–0009)

**Files:** `docs/adr/0002-holds-are-3-day-extendable-once-operator-configurable.md`, `0003-group-gift-contributions-go-to-the-owner-no-designated-buyer.md`, `0004-pledged-vs-confirmed-states-payments-unverifiable-by-design.md`, `0005-no-shipping-address-collected.md`, `0006-single-currency-per-list.md`, `0007-event-sourcing-for-the-ledger-only-audit-table-for-crud.md`, `0008-event-streams-scoped-per-item-not-per-list.md`, `0009-synchronous-in-transaction-projections-not-eventually.md`

**Per-file notes:**
- 0002–0006: no `Detail` block — Context/Alternatives will be thinner (synthesize from the Decision line and its linked spec topic; don't invent alternatives that aren't implied by the Decision line).
- 0004, 0006: cited by 0063 (which is rewritten in Task 8) — keep their Decision lines precise since 0063's Alternatives section will reference them.
- 0007: foundational, cited by 0059/0062 (Task 8) — its Consequences section is a good place to state explicitly that it's a load-bearing precedent.
- 0008: cited by 0059 (Task 8).

- [ ] Steps 1–5 as described in "Batch rewrite tasks" above, applied to all 8 files.
- [ ] Verification steps as described above.
- [ ] **Commit:**

```bash
git add docs/adr/0002-*.md docs/adr/0003-*.md docs/adr/0004-*.md docs/adr/0005-*.md docs/adr/0006-*.md docs/adr/0007-*.md docs/adr/0008-*.md docs/adr/0009-*.md
git commit -m "docs(adr): Nygard rewrite for 0002-0009 (ledger/event-sourcing foundations)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018kTuwdPr7uZEkVEXJgtcN9"
```

### Task 4: Batch 2 — access/identity/data-lifecycle foundations (0010–0017)

**Files:** `0010-seq-based-optimistic-concurrency-no-hash-chaining.md`, `0011-overfunding-stays-assigned-to-the-same-item.md`, `0012-clean-architecture-backend-front-end-does-not-mirror-it.md`, `0013-item-type-immutable-after-first-claim.md`, `0014-list-creation-self-locks-gated-by-createsecret-thereafter.md`, `0015-owner-tokens-are-shared-per-list-not-per-owner.md`, `0016-no-public-list-directory-lookups-fail-generically.md`, `0017-items-with-ledger-history-are-archived-not-deleted.md`

**Per-file notes:**
- 0013: precedent cited by 0063's currency-immutability reasoning (Task 8).
- 0014: has a real `Detail` block — two rejected alternatives (single shared secret, email allow-list) belong in Alternatives considered, not folded into Context.
- 0016: load-bearing precedent for 0056's and 0058's enumeration-guard reasoning (Tasks 7–8) — make the "no public directory, generic failure" decision explicit enough that those later files can cite it precisely.
- 0017: precedent cited by 0062 (Task 8) for rejecting hard delete.

- [ ] Steps 1–5 applied to all 8 files, verification, then:

```bash
git add docs/adr/0010-*.md docs/adr/0011-*.md docs/adr/0012-*.md docs/adr/0013-*.md docs/adr/0014-*.md docs/adr/0015-*.md docs/adr/0016-*.md docs/adr/0017-*.md
git commit -m "docs(adr): Nygard rewrite for 0010-0017 (access/identity/data-lifecycle foundations)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018kTuwdPr7uZEkVEXJgtcN9"
```

### Task 5: Batch 3 — spoiler/reveal + a11y interaction basics (0018–0021, 0023–0026)

**Files:** `0018-group-fund-targetminor-is-editable-and-read-live.md`, `0019-quantity-may-drop-below-committed-holds-purchases.md`, `0020-owner-status-identity-visibility-auto-reveals-at-revealafter.md`, `0021-thank-you-tracking-stored-outside-rebuildprojections-scope.md`, `0023-giver-message-visible-to-owner-immediately-not-spoiler-gated.md`, `0024-wcag-2-2-level-aa-is-the-accessibility-target.md`, `0025-hold-sheet-and-contribute-flow-use-native-dialog.md`, `0026-screen-reader-status-changes-use-aria-live-regions.md`

**Per-file notes:**
- 0018: 0047 (Task 6) carves out a deliberate, distinct exception (payment-method snapshot) to this ADR's live-read rule — mention that forward-reference isn't needed here, but don't word the Decision in a way that implies zero exceptions.
- 0020: **amended by 0072** (sticky `revealedAt`, rewritten in Task 9) — decision itself unchanged, this is legitimate Context material, not a supersession; `Status` stays `Accepted`. **Also fix the pre-existing bug flagged in the rollout addendum:** the current `Detail` block still describes `revealAfter` as *derived* from `eventDate` + timezone. That was reversed by ADR-0066 (Task 8): `revealAfter` is now *stored*, not derived. When writing this file's Context/Consequences, describe `revealAfter` as stored (per 0066), not derived — carry forward the *decision* (auto-reveal at `revealAfter`, overriding the owner-visibility settings) unchanged, but don't repeat the now-wrong "derived" mechanism as if it were still current.
- 0021: precedent for 0059's/0061's side-table pattern (Task 8).

- [ ] Steps 1–5 applied to all 8 files (0020 per its extra note above), verification, then:

```bash
git add docs/adr/0018-*.md docs/adr/0019-*.md docs/adr/0020-*.md docs/adr/0021-*.md docs/adr/0023-*.md docs/adr/0024-*.md docs/adr/0025-*.md docs/adr/0026-*.md
git commit -m "docs(adr): Nygard rewrite for 0018-0026 (spoiler/reveal + a11y basics, fix stale 0020 revealAfter wording)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018kTuwdPr7uZEkVEXJgtcN9"
```

### Task 6: Batch 4 — a11y/i18n/ops/backup foundations (0027–0034)

**Files:** `0027-axe-core-wired-into-e2e-ci-blocks-on-serious-critical-only.md`, `0028-browser-support-matrix-widened-for-the-guest-facing-surface.md`, `0029-i18n-groundwork-is-intl-formatting-plus-icu-messageformat.md`, `0030-performance-resource-targets-set-for-pi-class-hardware.md`, `0031-logging-metrics-tracing-standardized-on-pino-opentelemetry.md`, `0032-physical-backup-via-vacuum-into-not-raw-file-copy.md`, `0033-migrations-are-forward-only-rollback-restore-from-backup.md`, `0034-crypto-shredding-deferred-whole-list-purge-covers-the-need.md`

**Per-file notes:**
- 0030: no `Detail` block, and the README notes it's fully covered by the performance-and-resource-budget spec topic — keep this one short; a thin Context that points at that spec file is correct, not a sign something's missing.
- 0033: underpins the upcaster-layer reasoning 0034/0050/0067 reference (0050 in Task 7, 0067 in Task 8) — make the forward-only-migrations decision explicit.
- 0034: **not a supersession** — the crypto-shredding deferral is upheld (re-tested by 0067, Task 8), so this stays `reformat-only` with `Status: Accepted`. Its cross-references to 0059/0067 are legitimate Context material (both come later in the corpus — 0059 in Task 8 — so phrase the reference as "a later decision reaffirmed this" rather than assuming the reader has read 0059/0067 yet).

- [ ] Steps 1–5 applied to all 8 files, verification, then:

```bash
git add docs/adr/0027-*.md docs/adr/0028-*.md docs/adr/0029-*.md docs/adr/0030-*.md docs/adr/0031-*.md docs/adr/0032-*.md docs/adr/0033-*.md docs/adr/0034-*.md
git commit -m "docs(adr): Nygard rewrite for 0027-0034 (a11y/i18n/ops/backup foundations)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018kTuwdPr7uZEkVEXJgtcN9"
```

### Task 7: Batch 5 — security/licensing basics (0035–0037, 0039, 0041–0044)

**Files:** `0035-threat-model-documented-in-docs-threat-model-md.md`, `0036-constant-time-comparison-generalized-to-all-secret.md`, `0037-session-and-owner-access-cookies-require-secure-https.md`, `0039-agpl-3-0-selected-as-project-licence.md`, `0041-security-disclosure-via-a-dedicated-email-address.md`, `0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md`, `0043-demo-instance-formally-deferred-not-rejected.md`, `0044-anonymous-contributions-resolved-name-required-owner-only.md`

**Per-file notes:**
- 0035: no `Detail` block, fully covered by the (now-renamed, Task 2) threat-model-summary spec topic — link to `[threat model](../spec/threat-model-summary.md)`, not the old filename.
- 0039: has a `Detail` block rejecting GPL-3.0/EUPL-1.2/OSL-3.0/SSPL — all four belong in Alternatives considered as separate bullets, not summarized as one.
- 0042: its venue-wifi false-positive concern is later revisited (not superseded) by 0068's mechanism fix (Task 8) — phrase as a forward-pointing open concern, not as something 0068 corrects a mistake in.
- 0044: **partial supersession, not full** — 0059/0060 (Task 8) narrow "name always required" to "required at creation, nullable by later erasure," but the owner-only-visibility policy (the actual core of this decision) is untouched. `Status` stays `Accepted`; the narrowing is Consequences material ("a later decision permits redaction after creation; visibility scope is unchanged").

- [ ] Steps 1–5 applied to all 8 files, verification, then:

```bash
git add docs/adr/0035-*.md docs/adr/0036-*.md docs/adr/0037-*.md docs/adr/0039-*.md docs/adr/0041-*.md docs/adr/0042-*.md docs/adr/0043-*.md docs/adr/0044-*.md
git commit -m "docs(adr): Nygard rewrite for 0035-0044 (security/licensing basics)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018kTuwdPr7uZEkVEXJgtcN9"
```

### Task 8: Batch 6 — payments/contributions/timing (0045–0052)

**Files:** `0045-sourceurl-env-var-drives-agpl-3-0-network-use-compliance.md`, `0046-payment-methods-are-per-list-configuration-not-a-hardcoded.md`, `0047-contribution-snapshots-its-payment-method-at-pledge-time.md`, `0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md`, `0049-contribution-amounts-bounded-by-absolute-and-target.md`, `0050-hold-contribution-submits-carry-a-client-generated.md`, `0051-civil-dates-and-instants-modelled-distinctly-via-per-list.md`, `0052-contribution-amount-recorded-only-at-i-ve-sent-it.md`

**Per-file notes:**
- 0045: precedent cited by 0058 (Task 9).
- 0047: a deliberate, named exception to 0018's live-read rule (Task 5) — Context should say so explicitly rather than reading as a contradiction.
- 0049: **partial amendment** — 0063 (Task 9) revises the absolute ceiling only; the target-relative bound and independence from `allowOverfunding` stand. `Status` stays `Accepted`; phrase as "the absolute figure below was later revised by a subsequent decision; the target-relative bound and independence from overfunding policy were not."
- 0051: foundational for 0072/0066's reveal-timing reasoning (Task 9).
- 0052: distinct in purpose from 0060's later guest-data-access secret (Task 9) — recovery convenience vs. subject-access right. State the distinction so a reader doesn't conflate the two secrets.

- [ ] Steps 1–5 applied to all 8 files, verification, then:

```bash
git add docs/adr/0045-*.md docs/adr/0046-*.md docs/adr/0047-*.md docs/adr/0048-*.md docs/adr/0049-*.md docs/adr/0050-*.md docs/adr/0051-*.md docs/adr/0052-*.md
git commit -m "docs(adr): Nygard rewrite for 0045-0052 (payments/contributions/timing)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018kTuwdPr7uZEkVEXJgtcN9"
```

### Task 9: Batch 7 — GDPR/erasure/privacy surface (0053–0060)

**Files:** `0053-owner-token-recovery-deferred-direct-operator-access-is-the.md`, `0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md`, `0055-guest-invite-qr-available-on-demand-from-the-owner-dashboard.md`, `0056-post-purgeat-lookups-return-the-same-generic-not-found.md`, `0057-instance-teardown-addressed-as-a-documentation-checklist.md`, `0058-owner-configurable-privacynotice-field-shown-only-when-set.md`, `0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md`, `0060-guest-self-service-data-access-erasure-via-guestdataaccess.md`

**Per-file notes:**
- 0053: the owner-email field collected against this deferred recovery flow was later removed as purposeless — worth one Consequences line noting the field's removal, since it's otherwise an orphaned historical detail.
- 0054: enables 0055's on-demand QR regeneration — order matters, keep 0054's Decision precise about plaintext storage since 0055 depends on it.
- 0056: upholds 0016's enumeration guard (Task 4) rather than carving an exception — say so explicitly.
- 0058: a later spec change removed pre-auth rendering of the `privacyNotice` field (enumeration + operator-identity leak), resolved by splitting pre/post-auth surfaces, recorded in this same ADR rather than a separate supersession — this belongs in Consequences as "resolved within this decision," not as a superseding note.
- 0059: **amends 0034's original event-based sketch** (Task 6) which would have left plaintext recoverable from the immutable log — 0034 itself remains `reformat-only`/`Accepted` per its own row; word 0059's Context as "a later refinement of the approach 0034 deferred to," not as overturning 0034.
- 0060: a deliberate granularity inversion against 0059 (session-scoped secret vs. per-record storage), not a conflict — Alternatives considered should note the inversion was intentional.

- [ ] Steps 1–5 applied to all 8 files, verification, then:

```bash
git add docs/adr/0053-*.md docs/adr/0054-*.md docs/adr/0055-*.md docs/adr/0056-*.md docs/adr/0057-*.md docs/adr/0058-*.md docs/adr/0059-*.md docs/adr/0060-*.md
git commit -m "docs(adr): Nygard rewrite for 0053-0060 (GDPR/erasure/privacy surface)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018kTuwdPr7uZEkVEXJgtcN9"
```

### Task 10: Batch 8 — manual contributions, currency, security hardening (0061–0068)

**Files:** `0061-offline-non-monetary-gifts-recorded-via-manualgiftentry.md`, `0062-manual-contributions-are-voidable-not-editable.md`, `0063-currency-validation-minor-unit-storage-and-the-ceiling.md`, `0064-the-owner-token-never-travels-in-a-url.md`, `0065-one-periodic-task-with-giver-email-purge-attached.md`, `0066-revealafter-is-stored-not-derived.md`, `0067-erasure-across-backups-and-the-subject-access-routing-fix.md`, `0068-client-ip-resolution-is-a-hop-count.md`

**Per-file notes:**
- 0062: its resolution breaks a cross-reference in 0061 (a precedent cited there no longer holds), but 0061's affordance stands independently — note this in 0062's Consequences; don't edit 0061 again in this batch (it was already rewritten correctly in this same batch using current information, so the forward-reference concern doesn't apply once both are rewritten together here).
- 0063: amends 0049 (Task 8) on the absolute bound only — phrase as narrowing, not replacing.
- 0064: explicitly distinguishes itself from 0022's guest-specific convenience reasoning (0022 no longer exists as a file — it was merged into 0069 in the pilot) rather than mirroring it — when rewriting, cite the comparison via `ADR-[069](./0069-the-guest-key-travels-in-a-fragment.md)` (the file that now carries 0022's reasoning), not a dead reference to 0022.
- 0066: **reverses 0072's rejection of a stored instant** — `revealAfter` becomes stored, not derived. 0072 (Task 11) already reflects this as a partial supersession of itself; word 0066's Decision plainly ("We will store `revealAfter` as a fixed instant...") since 0020 (Task 5) and 0072 (Task 11) both depend on getting this ADR's Decision right.
- 0067: re-examines and reaffirms 0034's crypto-shredding deferral (Task 6) rather than reopening it — Context should say "reaffirms," not "revisits."
- 0068: fixes a mechanism defect that is a sibling of, not a re-tune of, 0042's rate-limit thresholds (Task 7) — keep the two decisions clearly separate in Alternatives considered (don't merge their reasoning).

- [ ] Steps 1–5 applied to all 8 files, verification, then:

```bash
git add docs/adr/0061-*.md docs/adr/0062-*.md docs/adr/0063-*.md docs/adr/0064-*.md docs/adr/0065-*.md docs/adr/0066-*.md docs/adr/0067-*.md docs/adr/0068-*.md
git commit -m "docs(adr): Nygard rewrite for 0061-0068 (manual contributions, currency, security hardening)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018kTuwdPr7uZEkVEXJgtcN9"
```

### Task 11: Batch 9 — repo-native ADRs (0071–0072)

**Files:** `0071-claude-code-and-gh-ship-in-the-app-image-with-no-baked-in.md`, `0072-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md`

**Per-file notes:**
- 0071: repo-native (not imported from `gubbins-spec.md`); depends on 0070's sandbox boundary (already Nygard-rewritten in the pilot) — cite it as `ADR-[070](./0070-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md)`.
- 0072: **partial supersession of itself, in the other direction** — its own current `Detail` text already says `revealedAt` is retained post-0066 (Task 10), "now guarding the narrower case" of a direct edit to the now-stored `revealAfter`. This is the most nuanced file in the corpus: its Decision must state the *original* mechanism ("We will make `revealedAt` sticky once `revealAfter` is first crossed, so later edits never re-hide what the owner has already seen") and its Consequences must carry forward, unedited in substance, the note that 0066 narrowed *what* `revealedAt` guards without removing the stickiness itself. Also carry forward the lazy-write detail (set in owner-request middleware, not on dashboard render, because ADR-0065's one-periodic-task decision — Task 10 — ruled out a scheduler for it) — this is real rationale, not filler, and must not be dropped.

- [ ] Steps 1–5 applied to both files, verification, then:

```bash
git add docs/adr/0071-*.md docs/adr/0072-*.md
git commit -m "docs(adr): Nygard rewrite for 0071-0072 (repo-native ADRs)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018kTuwdPr7uZEkVEXJgtcN9"
```

---

## Task 12: Terminal renumbering

Runs once, after Tasks 3–11 are all committed. Walks the 70 survivors (0001–0072 minus the pilot's already-deleted 0022 and 0038 — confirmed by the inventory as the only merge-candidates in the full 72-ADR corpus, so no new gaps were introduced by Tasks 3–11) in numeric order and renumbers them `0001..0070` with no gaps, rewriting every cross-reference form found in the corpus.

**Files:**
- Create: `scripts/renumber_adrs.py`
- Modify: every file in `docs/adr/*.md` (renamed), `docs/adr/README.md`, `docs/spec/*.md`, `gubbins-spec.md`

**Interfaces:**
- Consumes: `scripts/check_adr_links.py` (Task 1) for verification.
- Produces: the final, stable ADR numbering — no later task in this plan renumbers again.

- [ ] **Step 1: Write the renumbering script**

The current corpus has exactly two gaps (22 and 38), both below the
highest surviving number (72), so the shift is a straightforward
piecewise offset — no generic "find gaps" logic is needed, but the
script computes it from the actual filenames present rather than
hardcoding the offsets, so it stays correct even if this task runs
later than expected and the file list has drifted slightly.

```python
#!/usr/bin/env python3
"""Terminal ADR renumbering: walk docs/adr/NNNN-*.md in numeric order,
renumber to 0001..N with no gaps, and rewrite every cross-reference form
in docs/adr/, docs/spec/, and gubbins-spec.md."""
import re
import subprocess
import sys
from pathlib import Path

ADR_DIR = Path('docs/adr')
FILENAME_RE = re.compile(r'^(\d{4})-(.+)\.md$')


def build_mapping() -> dict[int, tuple[int, str]]:
    """old_number -> (new_number, slug)"""
    entries = []
    for f in sorted(ADR_DIR.glob('*.md')):
        m = FILENAME_RE.match(f.name)
        if not m:
            continue  # skips README.md (no leading digits)
        old_num, slug = int(m.group(1)), m.group(2)
        if old_num == 0:
            continue  # 0000-adr-template.md is not a real ADR; never renumbered
        entries.append((old_num, slug))
    entries.sort(key=lambda e: e[0])
    mapping = {}
    for new_num, (old_num, slug) in enumerate(entries, start=1):
        mapping[old_num] = (new_num, slug)
    return mapping


def rename_files(mapping: dict[int, tuple[int, str]], dry_run: bool) -> None:
    # Two-phase rename (via a temp suffix) so a shift never overwrites a
    # not-yet-renamed file when new numbers cross old ones.
    moves = []
    for old_num, (new_num, slug) in mapping.items():
        if old_num == new_num:
            continue
        old_path = ADR_DIR / f'{old_num:04d}-{slug}.md'
        new_path = ADR_DIR / f'{new_num:04d}-{slug}.md'
        moves.append((old_path, new_path))
    for old_path, _ in moves:
        tmp = old_path.with_suffix('.md.tmp-renumber')
        print(f'git mv {old_path} {tmp}')
        if not dry_run:
            subprocess.run(['git', 'mv', str(old_path), str(tmp)], check=True)
    for old_path, new_path in moves:
        tmp = old_path.with_suffix('.md.tmp-renumber')
        print(f'git mv {tmp} {new_path}')
        if not dry_run:
            subprocess.run(['git', 'mv', str(tmp), str(new_path)], check=True)


LINK_RE = re.compile(
    r'(ADR-)?\[(\d{3,4})\]\(((?:\.{1,2}/)?(?:adr/)?)(\d{4})-([a-z0-9-]+)\.md\)'
)
BARE_RE = re.compile(r'\bADR-(\d{1,4})\b(?!\]|\()')
H1_RE = re.compile(r'^# (\d{4})\. ')


def rewrite_text(text: str, mapping: dict[int, tuple[int, str]]) -> str:
    def link_sub(m: re.Match) -> str:
        prefix, _label, path_prefix, num_str, slug = m.groups()
        old_num = int(num_str)
        if old_num not in mapping:
            return m.group(0)  # points at a deleted ADR; leave as-is
        new_num, new_slug = mapping[old_num]
        new_label = f'{new_num:03d}'
        new_path_num = f'{new_num:04d}'
        return f'{prefix or ""}[{new_label}]({path_prefix}{new_path_num}-{new_slug}.md)'

    text = LINK_RE.sub(link_sub, text)

    def bare_sub(m: re.Match) -> str:
        digits = m.group(1)
        old_num = int(digits)
        if old_num not in mapping:
            return m.group(0)  # deleted ADR (e.g. the historical "ADR-022"
                                # / "ADR-038" mentions) - leave untouched
        new_num, _ = mapping[old_num]
        return f'ADR-{new_num:0{len(digits)}d}'

    text = BARE_RE.sub(bare_sub, text)
    return text


def rewrite_h1(text: str, old_num: int, mapping: dict[int, tuple[int, str]]) -> str:
    new_num, _ = mapping[old_num]
    return H1_RE.sub(f'# {new_num:04d}. ', text, count=1)


def main() -> int:
    dry_run = '--dry-run' in sys.argv
    mapping = build_mapping()
    changed = sum(1 for old, (new, _) in mapping.items() if old != new)
    print(f'{len(mapping)} surviving ADRs; {changed} need renumbering.')
    for old_num in sorted(mapping):
        new_num, slug = mapping[old_num]
        if old_num != new_num:
            print(f'  {old_num:04d} -> {new_num:04d}  ({slug})')

    # Rewrite each ADR's own H1 before renaming (path still has old number).
    for old_num, (new_num, slug) in mapping.items():
        if old_num == new_num:
            continue
        path = ADR_DIR / f'{old_num:04d}-{slug}.md'
        text = path.read_text(encoding='utf-8')
        text = rewrite_h1(text, old_num, mapping)
        if not dry_run:
            path.write_text(text, encoding='utf-8')

    rename_files(mapping, dry_run)

    targets = list(ADR_DIR.glob('*.md')) + list(Path('docs/spec').glob('*.md')) + [Path('gubbins-spec.md')]
    for path in targets:
        if not path.exists():
            continue
        text = path.read_text(encoding='utf-8')
        new_text = rewrite_text(text, mapping)
        if new_text != text:
            print(f'rewrite refs: {path}')
            if not dry_run:
                path.write_text(new_text, encoding='utf-8')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
```

- [ ] **Step 2: Fixture test — verify the mapping arithmetic and rewrite logic on a scratch copy**

```bash
rm -rf /tmp/adr-renumber-fixture
mkdir -p /tmp/adr-renumber-fixture/docs/adr /tmp/adr-renumber-fixture/docs/spec
cd /tmp/adr-renumber-fixture
git init -q
cat > docs/adr/0001-first.md <<'EOF'
# 0001. First

See ADR-[003](./0003-third.md) and [001](0001-first.md).
EOF
cat > docs/adr/0003-third.md <<'EOF'
# 0003. Third

Refers back to ADR-001 in prose, and to the deleted ADR-002.
EOF
git add -A && git commit -q -m init
cp /workspace/scripts/renumber_adrs.py .
python3 renumber_adrs.py --dry-run
```

Expected output shows a mapping of `0003 -> 0002` (the gap at 0002 is
closed) and `0001 -> 0001` (unchanged), and lists only `0001-first.md`
as needing a reference rewrite — `0003-third.md`'s own bare mentions
("ADR-001", "ADR-002") don't actually change text (001 didn't move, and
002 was never a real file so it's left alone), so it's correctly absent
from that list even though it's the file being renamed. Then run for
real:

```bash
python3 renumber_adrs.py
ls docs/adr/
cat docs/adr/0002-third.md
cat docs/adr/0001-first.md
cd /workspace
rm -rf /tmp/adr-renumber-fixture
```

Expected: `docs/adr/0002-third.md` exists (renamed from `0003-`), its H1
reads `# 0002. Third`, its body still says "Refers back to ADR-001 in
prose" (unchanged — 001 didn't move) "and to the deleted ADR-002" —
this one is a trap in the fixture: the literal text "ADR-002" in the
*original* 0003 file was talking about a since-deleted ADR that never
existed as a real file in the fixture, so it must NOT be touched by the
mapping (0002 isn't a key in the pre-renumber mapping since it was never
a file) — confirms the script only rewrites references to numbers that
actually exist as files, exactly the property needed to leave the real
corpus's "the original decision (ADR-022)" / "(0038, ...)" narrative
mentions of the pilot's deleted ADRs alone. And `docs/adr/0001-first.md`
now reads `See ADR-[002](./0002-third.md) and [001](0001-first.md)`.

- [ ] **Step 3: Run for real against the full corpus**

```bash
git status --short   # confirm clean before a mechanical repo-wide rewrite
python3 scripts/renumber_adrs.py
```

Review the printed mapping — every entry should show a shift of exactly
0 (for numbers ≤ 21), −1 (for 23–37), or −2 (for 39–72), per the two
gaps at 22 and 38. Anything else means a new gap crept in during Tasks
3–11 that this plan didn't account for — stop and investigate before
continuing (it would mean a batch task silently deleted or merged a
file it wasn't supposed to).

- [ ] **Step 4: Fix up `docs/adr/README.md` by hand**

The script rewrites the Index table's row links and the "Imported ADRs"
paragraph's bracket-linked ADR citations, but the surrounding prose in
that paragraph narrates the *old* numbering history ("0001–0069, plus
0072... no longer contiguous... 0022 and 0038 were folded/deleted...").
That's now resolved history, not current state. Replace the "Imported
ADRs" section (originally the section spanning from its heading to the
line "0073 onward remains free.") with:

```markdown
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

*(Not every ADR carries a long Consequences section. Some decisions are
fully covered by their linked spec topic and stay short — absence of
detail is not absence of reasoning.)*
```

Also double check the Index table itself was correctly updated by the
script (spot-check a few rows against the printed mapping from Step 3).

- [ ] **Step 5: Run the link checker**

```bash
python3 scripts/check_adr_links.py
```

Expected: `All links resolve.` If not, the broken link's source file and
target tell you exactly which cross-reference form Step 1's regexes
missed — fix the regex (not the individual file) and rerun Step 3 from
a clean `git status` (use `git reset --hard` back to the pre-Step-3
commit first, since Step 3 is a repo-wide mechanical rewrite that should
be redone in full, not patched file-by-file).

- [ ] **Step 6: Commit**

```bash
git add scripts/renumber_adrs.py docs/adr/ docs/spec/ gubbins-spec.md
git commit -m "docs(adr): terminal renumbering — 0001-0070, no gaps

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018kTuwdPr7uZEkVEXJgtcN9"
```

---

## Task 13: Final verification sweep

**Files:** none modified (read-only verification); fixes go back into
whichever earlier task's file needs them if this task finds a problem.

- [ ] **Step 1: Link checker, full corpus**

```bash
python3 scripts/check_adr_links.py
```

Expected: `All links resolve.`

- [ ] **Step 2: Zero `Superseded by` status lines remain**

`docs/adr/README.md` legitimately contains the literal string
`Superseded by` twice (the convention prose describing the status
lifecycle, e.g. `` `Proposed` → `Accepted` → (`Superseded by NNNN` |
`Deprecated`) ``) — exclude it, and check only the numbered ADR files'
actual `Status:` lines:

```bash
grep -l "Superseded by" docs/adr/0[0-9][0-9][0-9]-*.md
```

Expected: no output.

- [ ] **Step 3: Zero stale `§[N.M]` labels remain**

```bash
grep -rn '§\[' docs/adr/ docs/spec/ gubbins-spec.md
```

Expected: no output.

- [ ] **Step 4: Every ADR (except the template) has exactly the four Nygard headings, in order**

```bash
for f in docs/adr/0*.md; do
  [ "$f" = "docs/adr/0000-adr-template.md" ] && continue
  headings=$(grep '^## ' "$f" | sed 's/^## //')
  expected=$'Context\nDecision\nAlternatives considered\nConsequences'
  if [ "$headings" != "$expected" ]; then
    echo "MISMATCH: $f"
    echo "$headings"
  fi
done
```

Expected: no `MISMATCH` lines.

- [ ] **Step 5: Every Decision section opens with "We will"**

Each ADR's Decision section is a heading line, then a blank line, then
the content — `-A1` only reaches the blank line, not the content, so
use `-A2` and take the last of those three lines:

```bash
for f in docs/adr/0*.md; do
  [ "$f" = "docs/adr/0000-adr-template.md" ] && continue
  line=$(grep -A2 '^## Decision' "$f" | tail -1)
  case "$line" in
    "We will"*) ;;
    *) echo "NOT 'We will': $f -> $line" ;;
  esac
done
```

Expected: no output.

- [ ] **Step 6: Numbering is contiguous 0001–0070, no gaps**

`0000-adr-template.md` also matches a bare `^[0-9]{4}-` glob (it has
four leading digits) — exclude it explicitly, the same fix already
applied to `scripts/renumber_adrs.py`'s `build_mapping()`:

```bash
ls docs/adr/ | grep -E '^[0-9]{4}-' | grep -v '^0000-' | sed -E 's/^([0-9]{4})-.*/\1/' | sort -u > /tmp/adr-nums.txt
python3 -c "
nums = [int(l) for l in open('/tmp/adr-nums.txt')]
expected = list(range(1, len(nums) + 1))
assert nums == expected, f'gap or misorder: got {nums[:5]}...{nums[-5:]}, expected 1..{len(nums)}'
print(f'OK: {len(nums)} contiguous ADRs, 0001-{len(nums):04d}')
"
rm /tmp/adr-nums.txt
```

Expected: `OK: 70 contiguous ADRs, 0001-0070`.

- [ ] **Step 7: `docs/adr/README.md` index row count matches file count**

```bash
grep -c '^| \[[0-9]' docs/adr/README.md
ls docs/adr/*.md | grep -vE '0000-adr-template|README' | wc -l
```

Expected: both numbers equal (70).

- [ ] **Step 8: If every check above passes, this rollout is complete.** No commit for this task (verification-only) — if any step fails, fix it via a small follow-up commit and rerun Steps 1–7 from scratch (not just the failing step, since a fix can reintroduce a break the earlier steps already cleared).

---

## Self-review notes

- **Spec coverage:** every open item from the design doc's "Rollout
  readiness" section is addressed: §[3.N] residue → folded into each
  batch (Global Constraints + per-batch instructions); terminal
  renumbering → Task 12; "We will" convention → Global Constraints,
  checked in every batch and in Task 13 Step 5; link-checker script →
  Task 1; the three pre-existing issues → Task 2 (README wording,
  threat-model naming) and Task 5 (0020's stale `revealAfter` wording).
- **Merge-candidates:** none exist among the 66 files (inventory
  confirms only 0022/0038, both already resolved in the pilot) — no
  batch task performs a fold or merge, only reformatting, which is why
  Task 12's renumbering script can safely assume the only two gaps are
  22 and 38.
- **Placeholder scan:** no task defers content to "later" — every batch
  names its exact files and gives per-file nuance notes for every ADR
  the inventory flagged as non-trivial; the two scripts are complete,
  runnable code, each proven against a fixture before being trusted
  against the real corpus.
