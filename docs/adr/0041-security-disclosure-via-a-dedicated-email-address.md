# 0041. Security disclosure via a dedicated email address

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Security disclosure via a dedicated email address (+ optional PGP key) in SECURITY.md, not GitHub-style private advisories

## Detail

**ADR-041 detail:** GitHub's private security-advisory workflow (structured intake, coordinated disclosure tooling built into the platform) has no equivalent on Forgejo/Codeberg at present. A dedicated security-contact email address (with an optional published PGP key for encrypted reports) is the pragmatic substitute — less structured and untracked compared to GitHub's flow, but a real, working disclosure channel that doesn't depend on platform features that don't exist here.
