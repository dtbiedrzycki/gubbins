# 0041. Security disclosure via a dedicated email address

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The project needs a working channel for researchers to report security
issues. GitHub's private security-advisory workflow (structured intake,
coordinated-disclosure tooling built into the platform) has no
equivalent on Forgejo/Codeberg, where this project is hosted.

## Decision

We will publish a dedicated security-contact email address, with an
optional published PGP key for encrypted reports, in SECURITY.md as the
disclosure channel.

## Alternatives considered

- **GitHub-style private security advisories** — rejected: the
  structured intake and coordinated-disclosure tooling this workflow
  depends on doesn't exist on Forgejo/Codeberg, where this project is
  hosted.

## Consequences

- Disclosure is less structured and untracked compared to GitHub's flow
  — there's no built-in intake form, status tracking, or coordinated
  advisory publication.
- The channel is real and working today rather than depending on
  platform features that don't exist on Forgejo/Codeberg.
- SECURITY.md must be kept current with the contact address and, if
  published, the PGP key.
