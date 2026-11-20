# Working on gubbins

Rules for every contributor, human or AI agent. `CLAUDE.md` and `GEMINI.md`
point here. Read [`README.md`](README.md) for what the app is and
[`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, migrations and releases.

## Setup

- Work in the dev container (`.devcontainer/`, Node 24.22). It installs
  dependencies on start.
- Every commit must carry an SSH signature from a key in `.allowed_signers`.
  Set it up once per clone as CONTRIBUTING describes. Never bypass the
  signing hooks.
- Non-trivial decisions are ADRs in [`docs/adr/`](docs/adr/README.md). Read
  the relevant ones before changing an area, and don't re-decide one
  without a new or amended ADR.

## Verify before you push

GitHub CI runs these checks on every PR, and a PR into `main` merges only
once they pass. This script runs the same checks locally, except commit
signatures, which the pre-push hook checks. Run it before you push:

```sh
scripts/verify.sh          # link check, shipped-migration guard, builds, lint, bats, every unit test
scripts/verify.sh --e2e    # the same plus the Playwright suite: run it for main and PRs into main
scripts/verify.sh --quick apps/api src/domain/entities/Hold.test.ts   # one file, while iterating
```

Run it on a clean tree: a pass prints `verify: all ... checks passed for
<sha>`, and on a dirty tree it says nothing was recorded. It doesn't run
the container smoke test, which needs Docker. CI runs it; locally, run
`scripts/container-smoke.sh` where you have Docker.

## Keep PRs small

Small PRs keep each change readable for a human reviewer. The value is in
the chunking.

- **At most 10 changed files per PR**, generated files and tests included.
  More PRs is fine; bigger PRs are not. Check with
  `git diff --stat <base>...HEAD | tail -1`.
- One concern per PR. Docs and ADRs go in their own PRs. One route or API
  contract change per PR.
- Each PR passes typecheck and tests on its own.
- A breaking interface change goes in steps: add the new API beside the
  old, move callers in batches, then remove the old one.
- Fixes to a PR's own code go into that PR. New work found in review
  becomes a new PR stacked on top.
- At most 8 stacked PRs open at once.

## PR descriptions

The reviewer reads the PR without the plan or the branch, so the body
stands alone. In this order, under about 150 words:

1. One to three sentences on what changes, in behaviour terms.
2. **Where it fits:** the larger change in product terms, its base
   ("Targets main" or "Builds on #n"), and what uses it later, if anything.
3. **How to review:** numbered steps, core file first, then the test that
   states the behaviour, then mechanical churn to skim.
4. **Review tier:** **Decide** (changes what a guest or owner sees),
   **Tests** (domain or persistence covered by tests) or **Skim**
   (mechanical).
5. **Decisions for you:** product choices the PR made, each with the
   alternative. Leave out if none.
6. **Heads-up:** an action the reviewer or deployer must take, code with
   no caller yet, or a follow-up left out on purpose. Leave out if none.

Describe the end state, not how review got there. When review fixes change
what a PR does, update its body.

No branch names, task numbers or plan paths in a PR body, commit, test name
or code comment. Describe the behaviour instead. ADR citations are fine,
except in text users see: error messages, startup errors and OpenAPI
descriptions.

## Tests: one rule, one test, at the layer that owns it

Before writing a test, ask which layer decides the rule (the line that
would change if the rule changed) and whether it is already tested there.
A layer above tests only what it adds.

| Layer | Tests | Does not test |
|---|---|---|
| Value object / entity | Invariants, state transitions, every refusal | — |
| Aggregate | Cross-entity rules, ownership, counters, its own refusals | Refusals its entities already make |
| Use case | One success path with what it persists and emits; its own branches | Domain refusals |
| Error mapping | Every error → status/code, as one table test | — |
| Request schema | Each required field and min/max | — |
| Route | One success path; errors reach the mapping; security matrices; one "schema refusal → 400" whose request lacks only that field | Domain or schema rules again |
| Contract suites | Behaviour every adapter, real and fake, shares | — |
| Component | Rendering, interaction, focus, its own branches | Messages passed through unchanged |
| E2E | One journey per user goal, plus accessibility scans | Anything a lower test pins |

- Each boundary value (0, the max) appears once per rule.
- Test names state the behaviour in plain words, with the numbers when
  it's about a limit. No vague verbs like "handles" or "keeps".
- One behaviour per test. Each assertion must be able to fail without the
  behaviour the name claims.
- Don't test test helpers, and don't test that removed code is gone.
- Before deleting a test as a repeat, break each behaviour it checked and
  show another test fails.
- Time-based tests use explicit UTC instants.

## Code: what reviewers look for

- **The domain owns its rules.** Primitives with invariants become value
  objects with `from()`. Invariants live in the private constructor so
  every path enforces them. The aggregate (Wishlist → Item → Hold /
  Contribution, ADR-0078) mints ids and decides; use cases only
  orchestrate. The exception is `piiRef`, which the use case mints beside
  the `guest_pii` insert (ADR-0057). Domain commands and queries take no
  date: load the aggregate as of an instant (`asOf`). An instant parameter
  is `at`, not `now`. Derive counters and statuses; adapters write what the
  domain decided. Domain commands return their ledger events.
- **Simplest shape that works.** No code without a caller yet, unless a
  later PR in the stack uses it and folding it in would break the 10-file
  cap; then the PR body names that PR. No near-identical types. No
  compatibility code for situations that can't occur. Name a repeated
  expression once.
- **Names say what things do.** Port methods are verbs; domain naming
  follows ADR-0079.
- **Answer "why?" in the code.** Every non-obvious constant, technique or
  guard gets a one-line why-comment.
- **Robust edges.** Release resources in `finally`, log retries and
  recoveries, and make fakes copy on read and write like real adapters.
- **One source of truth.** Share route paths and query keys, or derive
  them from the OpenAPI contract (ADR-0077).

### Settled, don't re-raise

- Union string literals, not TS `enum`.
- A hand-written composition root, no IoC container.
- Ids are UUIDv7 (ADR-0076).
- One `Item` class with a type field, not subclasses.
- Text input: the domain and the web trim every field, and the domain owns
  every length. Request schemas don't trim or limit text, except the
  payment handles' 254 cap.
- Database CHECKs back up structural invariants only, never text lengths
  (ADR-0083).
- Shipped migrations are never edited; a schema change is a new migration
  (ADR-0085).

## Never

- Commit secrets, `.env.prod` or the signing keys under
  `.devcontainer/secrets/`.
- Link to private or temporary pages (chat links, hosted previews) from
  the repo. Commit mockups as HTML under `docs/design/` instead.
- Run `docker compose -f docker-compose.prod.yml down -v`: it deletes the
  production database.
