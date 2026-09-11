# 0039. AGPL-3.0 selected as project licence

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

AGPL-3.0 selected as project licence; GPL-3.0, EUPL-1.2, OSL-3.0, and SSPL evaluated and rejected

## Detail

**ADR-039 detail:** AGPL-3.0 was selected over GPL-3.0 because GPL's copyleft triggers on distribution, not network use — a hosted SaaS fork of a GPL-3.0 project never "distributes" anything, so the fork-and-close-source risk this project wants to prevent remains fully open under plain GPL. EUPL-1.2 and OSL-3.0 achieve a comparable network-copyleft effect to AGPL but carry smaller ecosystems, less case law, and less contributor/reviewer familiarity, with no offsetting benefit for this project (EUPL's chief differentiator — EU-jurisdiction official-language legal text — isn't a relevant factor here). SSPL was considered as a stronger-than-AGPL option (extending copyleft to service-management code around the app, not just the app itself) but rejected outright: it is not OSI-approved, and using it would directly contradict the requirement that the project and its derivatives remain open source.
