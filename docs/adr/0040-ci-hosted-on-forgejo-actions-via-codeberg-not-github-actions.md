# 0040. CI hosted on Forgejo Actions via Codeberg, not GitHub Actions

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The project is hosted on Codeberg, not GitHub, so CI cannot assume GitHub
Actions' free-tier minute allowance for open source projects — Codeberg's
shared runners are quota-limited by comparison. A CI platform and
workflow-engine choice was needed, along with a decision about where to
run the more expensive verification steps (SBOM generation, container
image scanning, multi-arch Docker builds) without blowing that quota on
routine pushes.

## Decision

We will run CI on Forgejo Actions via Codeberg, not GitHub Actions.
Forgejo Actions was chosen over the older Woodpecker CI path because it uses
GitHub Actions-compatible workflow syntax (easing any future migration
either direction) and is the actively developed option. SBOM generation,
container image scanning, and multi-arch builds are release-gated — run
on release tags, not on every push — to keep the routine PR pipeline
affordable under the shared-runner quota. A self-hosted runner is
documented as an option for a maintainer who wants the full release-gate
pipeline running on every push instead, since that removes the quota
constraint.

## Alternatives considered

- **GitHub Actions** — not applicable; the project's repository host is
  Codeberg, not GitHub, so GitHub Actions was never available as the
  primary CI platform.
- **Woodpecker CI** — rejected in favor of Forgejo Actions: Woodpecker
  predates it as Codeberg's CI option, but Forgejo Actions' GitHub
  Actions-compatible syntax and active development made it the better
  long-term choice.
- **Running SBOM/image-scan/multi-arch steps on every push** — rejected:
  infeasible under Codeberg's shared-runner quota for routine PR
  iteration. Deferred to the release-tag gate instead, with a
  self-hosted runner documented as an opt-in for maintainers who want
  tighter feedback and have removed the quota constraint themselves.

## Consequences

- The routine PR pipeline stays affordable under Codeberg's shared-runner
  quota.
- SBOM/image-scan/multi-arch results are only available at release tags,
  not on every push, unless a maintainer opts into a self-hosted runner.
- Formerly split out as its own ADR (0038, "dependency/SBOM/image
  scanning scope") before this decision existed in full. ADR-038 added
  no rationale beyond what this entry already states and has been folded
  in here; see git history for the original file.
