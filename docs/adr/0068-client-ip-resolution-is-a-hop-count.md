# 0068. Client IP resolution is a hop count

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

`TRUST_PROXY` defaulted to `false` while
ADR-[037](./0037-session-and-owner-access-cookies-require-secure-https.md)
made HTTPS a deployment requirement and identified the target
population as self-hosters behind hobbyist reverse proxies — so the
documented deployment and the default configuration were in direct
conflict. Behind a proxy with the flag unset, every request presents
the proxy's address and all five per-IP thresholds in
[threat model summary](../spec/threat-model-summary.md) become one
global bucket: five mistyped keys lock out an entire guest list for
fifteen minutes, which at a physical event with a printed key is not an
edge case.

## Decision

We will resolve client IP behind a proxy as a hop count
(`TRUSTED_PROXY_HOPS`), not a boolean, counting the Nth entry in
`X-Forwarded-For` from the right — the position written by controlled
infrastructure, invariant to however much an attacker prepends.
Misconfiguration in either direction is detected and warned about, and
the resolved address is logged once at start so an operator can verify
it in seconds.

## Alternatives considered

- **Flip the default to `true`** — rejected as the more dangerous
  error: a boolean `true` means trusting any `X-Forwarded-For`, and an
  attacker rotating that header evades every limit in the table,
  including `CREATE_SECRET`. Both settings being wrong is the signal
  that the type is wrong: the real question is not whether to trust a
  proxy but how many sit in front, and only a count answers it.
- **A CIDR allowlist** — rejected for this audience as more precise but
  wrong-shaped: it asks a hobbyist to know their Docker network
  topology, where a hop count asks a question the quickstart can simply
  answer.
- **Read `CF-Connecting-IP` directly** — rejected as vendor-specific: on
  the Tunnel path it is simpler and harder to get wrong, since
  Cloudflare strips any inbound copy, but the spec continues to support
  nginx/Caddy/Traefik operators; a Tunnel-only deployment could
  reasonably use it instead.
- **Refuse to start on suspected misconfiguration** — rejected: the
  signal is a request header, uncheckable at boot, and an outage during
  an event is worse than degraded limits during one.

## Consequences

- The mechanism is narrow and worth stating precisely, because it is
  easy to over-trust: each proxy *appends* to `X-Forwarded-For` the
  address of the peer it received from, so the header grows
  left-to-right as a request travels inward and the rightmost entries
  are the ones the operator's own infrastructure wrote. Reading the Nth
  entry from the right is invariant to however much an attacker
  prepends; reading from the left (`XFF[0]`) is the classic
  vulnerability, that position being entirely attacker-supplied.
- What the count does not protect against: a proxy configured to
  overwrite rather than append (nginx's `$remote_addr` versus
  `$proxy_add_x_forwarded_for`) shifts the arithmetic silently, which is
  why the resolved address is logged once at start; a count set too
  high reads leftward into attacker-controlled entries, which is why an
  over-high value warns and falls back rather than trusting what it
  finds; and a request reaching the app directly bypasses the chain
  entirely, which is where Cloudflare Tunnel is genuinely stronger than
  a self-hosted nginx, since with no public port there is no path
  around the edge for a forged header to enter.
- **This is a mechanism defect, not a threshold question, and is a
  sibling of ADR-[042](./0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md)'s
  rate-limit tuning, not a re-tune of it.** ADR-042's numbers are left
  untouched; this decision only fixes how the IP feeding those numbers
  is resolved.
- It does mean the pre-v1 test was measuring the wrong configuration;
  [testing](../spec/testing.md) now runs three scenarios: direct,
  behind a misconfigured proxy, and behind shared VPN egress.
