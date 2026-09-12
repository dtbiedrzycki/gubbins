# 0045. SOURCE_URL env var drives AGPL-3.0 network-use compliance link

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

AGPL-3.0 §13's network-use trigger fires the moment a modified instance
serves remote users — which, for this app, is essentially every real
deployment, since guests interacting with the registry over the network are
exactly that. A hardcoded upstream link in the footer/about page would only
keep an *unmodified* deployment compliant; the obligation to update it falls
on the operator the moment they change the code, which is easy to forget for
a non-technical self-hoster making a small tweak.

## Decision

We will drive the footer/about-page source link from a `SOURCE_URL`
environment variable, turning "remember to comply with the license" into
"update an env var" — consistent with how the project already lowers the
bar for non-expert operators elsewhere (e.g. the `generate-invite-secret`
CLI helper).

## Alternatives considered

- **Hardcoded upstream link** — keeps an unmodified deployment compliant
  but relies on every operator who modifies the code remembering to also
  edit the link, which is exactly the failure mode non-technical
  self-hosters are prone to.

## Consequences

- Compliance becomes a configuration step rather than a code edit, lowering
  the chance a self-hoster ships a modified instance out of compliance
  without realizing it.
- The project takes on documenting `SOURCE_URL` clearly enough that
  operators know to set it when they fork or modify the code.
