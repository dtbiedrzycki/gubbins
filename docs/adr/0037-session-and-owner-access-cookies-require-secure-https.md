# 0037. Session and owner-access cookies require Secure; HTTPS required

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Session and owner-access cookies require the `Secure` attribute; HTTPS stated as a deployment requirement, not implied

## Detail

**ADR-037 detail:** The credentials-in-cookies access model (signed, httpOnly, list-scoped session cookie; owner token) was previously silent on transport security. Given the target deployment population (self-hosters on Pi-class hardware behind hobbyist reverse proxies) is exactly the group most likely to skip TLS if not told otherwise, `Secure` is now a stated cookie requirement and HTTPS a stated deployment requirement, not merely implied by best practice.
