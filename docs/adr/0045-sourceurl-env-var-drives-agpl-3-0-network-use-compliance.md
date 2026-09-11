# 0045. SOURCE_URL env var drives AGPL-3.0 network-use compliance link

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

`SOURCE_URL` env var added, driving a footer/about-page link, to make AGPL-3.0 network-use compliance a config change rather than a forgotten obligation for self-hosters who modify the code

## Detail

**ADR-045 detail:** AGPL-3.0 §13's network-use trigger fires the moment a modified instance serves remote users — which, for this app, is essentially every real deployment, since guests interacting with the registry over the network are exactly that. A hardcoded upstream link would only keep an *unmodified* deployment compliant; the obligation to update it falls on operators the moment they change the code, which is easy to forget for a non-technical self-hoster making a small tweak. Making the link config-driven (rather than requiring a code edit to change it) turns "remember to comply with the license" into "update an env var," consistent with how the project already lowers the bar for non-expert operators elsewhere (e.g. the `generate-invite-secret` CLI helper).
