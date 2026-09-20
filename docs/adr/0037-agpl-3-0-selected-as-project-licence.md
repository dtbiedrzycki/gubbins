# 0037. AGPL-3.0 selected as project licence

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The project needs a licence that keeps it and its derivatives open
source, including derivatives operated as a hosted service rather than
distributed as software. That requirement rules out permissive licences
outright and narrows the field to copyleft options that differ in how
and where their copyleft obligation triggers.

## Decision

We will license the project under AGPL-3.0.

## Alternatives considered

- **GPL-3.0** — rejected: GPL's copyleft triggers on distribution, not
  network use, so a hosted SaaS fork never "distributes" anything under
  GPL's terms. The fork-and-close-source risk this project wants to
  prevent remains fully open under plain GPL-3.0.
- **EUPL-1.2** — rejected: achieves a comparable network-copyleft effect
  to AGPL but carries a smaller ecosystem, less case law, and less
  contributor/reviewer familiarity, with no offsetting benefit for this
  project — EUPL's chief differentiator (EU-jurisdiction official-language
  legal text) isn't a relevant factor here.
- **OSL-3.0** — rejected: for the same reasons as EUPL-1.2 — a comparable
  network-copyleft effect with a smaller ecosystem and less familiarity,
  and no benefit specific to this project that would offset that.
- **SSPL** — rejected: considered as a stronger-than-AGPL option
  (extending copyleft to service-management code around the app, not just
  the app itself), but it is not OSI-approved, and using it would
  directly contradict the requirement that the project and its
  derivatives remain open source.

## Consequences

- Any hosted fork of the project must release its modified source,
  closing the network-use loophole that plain GPL-3.0 would have left
  open.
- The project inherits AGPL-3.0's larger ecosystem and case law relative
  to EUPL-1.2 or OSL-3.0, at the cost of AGPL's own reputation for
  cautious adoption at some organizations.
