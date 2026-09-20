# 0040. CI hosted on Forgejo Actions via Codeberg, not GitHub Actions

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

CI hosted on Forgejo Actions via Codeberg, not GitHub Actions; SBOM/image-scan/multi-arch build steps release-gated (not per-push) given shared-runner quota limits; self-hosted runner documented as an option

## Detail

**ADR-040 detail:** Hosting on Forgejo/Codeberg rather than GitHub means CI cannot assume GitHub Actions' free-tier minute allowance for open source projects; Codeberg's shared runners are quota-limited by comparison. Forgejo Actions was chosen over the older Woodpecker CI path since it uses GitHub Actions-compatible workflow syntax (easing any future migration either direction) and is the actively developed option. Expensive steps (SBOM generation, container image scanning, multi-arch Docker builds) were moved to the release-tag gate rather than running on every push, to keep the routine PR pipeline affordable under a shared-runner quota; a maintainer who runs their own Forgejo runner can opt into running the full release-gate pipeline on every push instead, since that removes the quota constraint.
