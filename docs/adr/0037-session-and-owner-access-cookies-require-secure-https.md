# 0037. Session and owner-access cookies require Secure; HTTPS required

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The credentials-in-cookies access model (signed, httpOnly, list-scoped
session cookie; owner token) was previously silent on transport security.
The target deployment population — self-hosters running on Pi-class
hardware behind hobbyist reverse proxies — is exactly the group most
likely to skip TLS if the spec doesn't say otherwise.

## Decision

We will require the `Secure` attribute on session and owner-access
cookies, and state HTTPS as an explicit deployment requirement rather
than something merely implied by best practice.

## Alternatives considered

- **Leave transport security as an implied best practice** — rejected:
  the self-hosting population most likely to skip TLS is exactly the one
  this spec needs to be explicit for; an implied requirement is one a
  hobbyist deployment can miss entirely.

## Consequences

- A deployment served over plain HTTP will have session and owner-access
  cookies silently rejected by the browser, since `Secure` cookies are
  not sent over non-HTTPS connections.
- Self-hosting documentation and setup guidance must call out HTTPS as a
  requirement, not an option, alongside the other deployment prerequisites.
