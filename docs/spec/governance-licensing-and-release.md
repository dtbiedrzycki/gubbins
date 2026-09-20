# Governance, licensing & release process

- **Licence: AGPL-3.0.** Chosen to keep this project and all future
  adaptations open source, including modified hosted-fork deployments.
  GPL-3.0 was rejected because it has no network-use trigger — a hosted
  SaaS fork never "distributes" anything, so the exact loophole this
  project wants closed stays open under plain GPL. EUPL-1.2 and OSL-3.0
  achieve a comparable network-copyleft effect but offer no advantage
  over AGPL's recognition and ecosystem familiarity (EUPL's main
  edge — EU-jurisdiction legal text and official translations — doesn't
  apply here). SSPL was evaluated and rejected outright: it is **not**
  OSI-approved open source, which directly contradicts the requirement
  that this project and its derivatives stay open source. *(ADR-[037](../adr/0037-agpl-3-0-selected-as-project-licence.md))*
- **Code of conduct**: Contributor Covenant, unmodified.
- **CONTRIBUTING.md**: devcontainer-first onboarding; the layer-boundary
  ESLint rule ([backend architecture](backend-architecture.md)) is a hard CI gate, not a style suggestion; changes
  touching the domain model or an existing invariant require an ADR stub
  in the PR.
- **SECURITY.md**: dedicated security-contact email address (optionally
  with a published PGP key) as the reporting channel — email rather than
  a forge's built-in private vulnerability reporting, so the channel
  survives a change of forge, at the cost of a structured/tracked
  in-platform flow.
  Best-effort response time stated plainly; coordinated disclosure;
  "supported versions: latest release" only — no multi-version support
  matrix promised pre-1.0. *(ADR-[039](../adr/0039-security-disclosure-via-a-dedicated-email-address.md))*
- **Hosting & CI platform**: repository on GitHub (private until the
  first release), CI on GitHub Actions. Kept forge-portable: workflows
  call repository scripts, and commit signatures verify offline against
  `.allowed_signers` ([commit signing](../commit-signing.md)). *(ADR-[038](../adr/0038-ci-runs-on-github-actions-kept-forge-portable.md))*
- **CI pipeline** (PR gate, every push): ADR/spec link check
  (`scripts/check_adr_links.py`, every relative link and heading anchor
  under [`docs/adr/`](../adr/README.md) and `docs/spec/`)
  → lint (incl. layer-boundary rule
  and the `piiRef` integrity assertion, [testing](testing.md))
  → typecheck → unit tests + coverage → integration tests (real SQLite)
  → migration test against seeded prior schema ([backup, restore & upgrade safety](backup-restore-and-upgrade.md)) → security tests
  (the full set enumerated in [testing](testing.md)) → Playwright e2e (incl. `axe`, [accessibility & browser support](accessibility-and-browser-support.md)).
- **Release gate** (tagged releases only, not every push): multi-arch
  Docker build, SBOM generation (CycloneDX via `syft`), dependency
  vulnerability scan, container image scan — run where the published
  image is produced. *(ADR-[038](../adr/0038-ci-runs-on-github-actions-kept-forge-portable.md))*
- **Dependency budget**: tied to the existing guest-bundle budget in
  [performance & resource budget](performance-and-resource-budget.md) via a `size-limit`-style CI check, rather than a separate vague
  policy. New runtime dependencies require a one-line justification in
  the PR description; devDependencies unconstrained.
- **Docs**: quickstart (docker-compose one-liner, minimal env vars,
  explicit callout that creation is open-by-default until the first
  list exists); reverse-proxy examples for nginx/Caddy/Traefik
  demonstrating `TRUSTED_PROXY_HOPS` set correctly for each topology, the
  app's own port left unpublished, and how to verify it from the
  resolved-address log line ([ops](ops.md)); backup
  guide covering `VACUUM INTO` +
  JSON export/import with an off-device-copy recommendation (per [backup, restore & upgrade safety](backup-restore-and-upgrade.md));
  the retention window and the redaction warning stated up front in the
  quickstart and backup guide, not only in the erasure section; and an
  erasure-request section covering the split between guest
  self-service and export ([privacy](privacy.md)), the beyond-use commitment, the backup
  retention window ([backup, restore & upgrade safety](backup-restore-and-upgrade.md)), and re-applying a redaction after any
  restore.
- **Quickstart recommends Cloudflare Tunnel plus a local reverse proxy**
  as the primary deployment path — no port forwarding, TLS handled at the
  edge, and `TRUSTED_PROXY_HOPS=2` shipped correct rather than left to
  the operator. The nginx/Caddy/Traefik examples remain fully supported
  for operators who know what they want; the recommendation is a default,
  not a constraint.
- Because the guest key now travels in a fragment (ADR-[067](../adr/0067-the-guest-key-travels-in-a-fragment.md)), the
  caveat previously attached to this path — that `?key=` lands in a third
  party's logs the operator cannot configure — **no longer applies**.
  That caveat is why the transport changed.
- **Teardown checklist**: a dedicated doc section (not just a line in the
  quickstart) covering what "done" looks like once the event has passed
  and `purgeAt` has run: stop and remove the container, delete the mounted
  volume (the DB is already purged by then, but the volume may still hold
  WAL/SHM files or old backups — and treat any backup still held as live
  personal data, subject to the same erasure obligations as the database
  itself), revoke/rotate any `CREATE_SECRET` values
  if the instance was ever exposed beyond the operator, and — if the
  operator used Cloudflare Tunnel or a similar always-on proxy — tear that
  down too rather than leaving a public hostname pointed at a stopped
  container. Framed as "an internet-facing box you forgot about is a
  liability, not just clutter," since the realistic failure mode is
  abandonment, not misuse. *(ADR-[055](../adr/0055-instance-teardown-addressed-as-a-documentation-checklist.md))*
- **Operator privacy guide**: what the app-rendered privacy notice
  states (what's collected, retention tied to `purgeAt`, the backup
  retention window, self-service data access), how to set
  `PRIVACY_CONTACT` to the operator's identity and contact, and when an
  owner's optional `privacyNotice` note is worth adding. *(ADR-[056](../adr/0056-privacy-notice-rendered-by-the-app-with-operator-contact.md))*
- **Demo instance**: deferred, not rejected. A public seeded demo would
  aid adoption but is real ongoing hosting/maintenance weight for a
  project whose architectural stance is "no infra run on your behalf."
  Revisit post-1.0 once maintenance burden is easier to judge against
  real adoption signal. If pursued later: nightly reset, seeded fake
  data, clearly labeled, same rate limits and `noindex` as production.
  *(ADR-[041](../adr/0041-demo-instance-formally-deferred-not-rejected.md))*
- **AGPL compliance for self-hosters**: README and the deployment guide
  explicitly explain that AGPL-3.0's network-use clause applies the moment
  guests interact with a modified instance over the network — not just on
  "distribution" in the traditional sense. Operators who edit the code and
  then let guests use it are responsible for updating `SOURCE_URL` (env
  var, [ops](ops.md)) to point at their own modified source; the app surfaces
  whatever `SOURCE_URL` is currently set to via a footer/about-page link,
  defaulting to the upstream repo so an unmodified deployment is compliant
  out of the box with zero configuration. This is flagged explicitly
  because the target self-hosting audience is often not familiar with
  AGPL's network trigger and could otherwise fall out of compliance in
  good faith. *(ADR-[043](../adr/0043-sourceurl-env-var-drives-agpl-3-0-network-use-compliance.md))*

---

[← Back to spec index](README.md)
