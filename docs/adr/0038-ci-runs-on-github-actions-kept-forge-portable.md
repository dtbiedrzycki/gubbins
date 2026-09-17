# 0038. CI runs on GitHub Actions, kept forge-portable

- **Status:** Accepted
- **Date:** 2026-09-17
- **Deciders:** dtbiedrzycki

## Context

The repository is hosted on GitHub, private until the first release.
The project deliberately avoids depending on any one forge: commit
signatures verify offline against `.allowed_signers`
([commit signing](../commit-signing.md)), and the repository may later
move or be mirrored. CI needs a home now without becoming the thing
that ties the project to its current host.

## Decision

We will run CI on GitHub Actions, with each check's logic living in
repository and npm scripts (`scripts/verify-signatures.sh`,
`npm run lint`/`test`/`build`) rather than in forge-specific actions
beyond checkout and toolchain setup. The `verify-signatures` job is the
binding signature gate on this host. SBOM generation, dependency and
container image scanning, and multi-arch builds run on release tags,
where the published image is produced.

## Alternatives considered

- **Forgejo Actions on Codeberg** — the previous choice, rejected: the
  repository is no longer hosted there, and CI on a forge the code does
  not live on would need a mirror kept in sync on every push.
- **GitHub's own signed-commit requirement instead of a CI job** —
  rejected: it trusts keys registered to GitHub accounts, not
  `.allowed_signers`, moving the trust anchor onto the forge.

## Consequences

- Changing forge means rewriting `.github/workflows/ci.yml`, not the
  checks it calls; Forgejo Actions reads largely the same workflow syntax.
- GitHub ignores custom `pre-receive` hooks, so signature enforcement
  here is only as binding as the CI job's result is on merging; a
  self-hosted mirror uses the `pre-receive` hook instead
  ([commit signing](../commit-signing.md)).
- Release-tag checks give no signal on ordinary pushes.
