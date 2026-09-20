# 0039. Security disclosure via a dedicated email address

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The project needs a working channel for researchers to report security
issues. The repository is currently on GitHub, whose private
vulnerability reporting offers structured intake and
coordinated-disclosure tooling, but the project is deliberately
forge-portable
(ADR-[038](./0038-ci-runs-on-github-actions-kept-forge-portable.md)): a
channel built into one forge stops working if the repository moves or is
mirrored.

## Decision

We will publish a dedicated security-contact email address, with an
optional published PGP key for encrypted reports, in SECURITY.md as the
disclosure channel.

## Alternatives considered

- **The forge's built-in private vulnerability reporting (currently
  GitHub's)** — rejected: it works only while the repository stays on
  that forge, and reports filed there do not move with it.

## Consequences

- Disclosure is less structured than a forge's built-in flow — there's
  no intake form, status tracking, or coordinated advisory publication.
- The channel survives a change of forge, since it depends on no
  platform feature.
- SECURITY.md must be kept current with the contact address and, if
  published, the PGP key.
