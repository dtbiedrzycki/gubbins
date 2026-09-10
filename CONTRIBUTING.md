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
