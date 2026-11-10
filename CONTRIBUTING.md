# Contributing to gubbins

## Development environment

Use the dev container in `.devcontainer/` — it pins Node 24.17 and the
toolchain (ESLint, Prettier, Vitest). Open the folder in an editor with
dev-container support and reopen in the container, or:

```sh
docker compose up -d
docker compose exec app bash
```

## Signed commits are required

Every commit must carry a valid SSH signature from a key listed in
[`.allowed_signers`](.allowed_signers). This is enforced in CI and can
be verified by anyone, offline, with no dependency on GitHub. See
[`docs/commit-signing.md`](docs/commit-signing.md) for the full model.

One-time setup per clone:

```sh
cp .devcontainer/secrets/signing.env.example .devcontainer/secrets/signing.env
# edit signing.env: SIGNING_NAME and SIGNING_EMAIL for this identity
bash scripts/setup-signing.sh
```

That generates a signing key (kept out of git under
`.devcontainer/secrets/`), configures git to sign and to verify, and
activates the repo's hooks via `core.hooksPath`.

Your **first** contribution should add your public-key line to
`.allowed_signers` in the same PR. It must be signed by a key already in
the file (an existing maintainer merges the first one for you).

Verify at any time:

```sh
bash scripts/verify-signatures.sh            # all of HEAD
bash scripts/verify-signatures.sh origin/main..HEAD
```

## Architecture Decision Records

Non-trivial decisions are recorded under `docs/adr/` — see
[`docs/adr/README.md`](docs/adr/README.md). Copy
`docs/adr/0000-adr-template.md` to start one.

## Changing the schema

Production holds real data, so a schema change is a new migration, never
an edit to an existing one
(ADR-[085](docs/adr/0085-releases-are-tagged-0x-versions-and-shipped-migrations-are-never-edited.md)):

1. Add `apps/api/src/infrastructure/db/migrations/NNNN_short_name.ts`,
   taking the next number, and list it in `migrations/index.ts`.
2. A migration that is in a release tag is never edited. Fix it with
   another new migration. `scripts/check-shipped-migrations.sh` fails
   when one is changed or deleted. Run it before pushing (the local gate
   runs it).
3. An event payload shape change needs a version bump and an upcaster
   (ADR-[032](docs/adr/0032-migrations-are-forward-only-rollback-restore-from-backup.md)),
   not an in-place edit.
4. A release that includes a migration bumps the minor version.

### What a migration can do

A release's pending migrations and their records run in one transaction,
so they apply together or not at all: if `0003` fails, `0002` rolls back
with it. Being inside a transaction limits what a migration can do in
SQLite:

- No `VACUUM` and no `PRAGMA journal_mode`. Both fail inside a
  transaction.
- `PRAGMA foreign_keys = OFF` silently does nothing. To change a column's
  type or a constraint, rebuild the table
  ([SQLite's procedure](https://www.sqlite.org/lang_altertable.html#otheralter))
  this way instead:
  1. `PRAGMA defer_foreign_keys = ON`.
  2. Create the new table, copy the rows, drop the old table, rename the
     new one, and recreate its indexes, triggers and views.
  3. Run `PRAGMA foreign_key_check` and throw if it returns any rows.
     This is the only check: the next step lets the commit through.
  4. `PRAGMA defer_foreign_keys = OFF`. Without it the commit fails with
     `FOREIGN KEY constraint failed` even when nothing is wrong.
- Don't rebuild a table that another table references with
  `ON DELETE CASCADE`, `SET NULL` or `SET DEFAULT`: dropping it fires
  those actions and deletes or blanks the child rows. No such reference
  exists today. If one is added, its rebuild needs a migration that runs
  outside the shared transaction.

## Cutting a release

Versions are `0.x`. Bump the **minor** number for a migration or a new
feature, and the **patch** number for fixes only.

1. From an up-to-date `main`, create a `release/vX.Y.Z` branch, run
   `npm version <minor|patch> --workspaces --include-workspace-root --no-git-tag-version`,
   then `npm run gen:api`, because the OpenAPI document carries the
   version.
2. Open a PR and merge it.
3. Tag the merge commit and push the tag:
   `git tag -a vX.Y.Z <merge commit> -m vX.Y.Z && git push origin vX.Y.Z`.
4. Build the container from the tag.
5. If the release bumps the minor number, stop the running container and
   copy `/data/wishlist.db` somewhere safe. This is the pre-upgrade
   backup ADR-0032 requires.
6. Deploy the new container.

Migrations are forward-only. To roll back, restore the database from
that copy (or another backup) and deploy the previous tag
(ADR-[032](docs/adr/0032-migrations-are-forward-only-rollback-restore-from-backup.md)).

## Stack

The front-end/back-end structure and framework choices are not settled
yet. Please raise them as ADRs rather than introducing them ad hoc.

## Tests

The shell tooling has a `bats` suite:

```sh
npm test            # runs: bats scripts/test
```

CI runs it as part of the `build` job.

## Commit messages

Use short, imperative subject lines (e.g. `add wishlist item endpoint`).
Reference an ADR or issue in the body when relevant.
