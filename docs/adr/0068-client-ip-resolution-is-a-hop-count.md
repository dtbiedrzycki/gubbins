# 0068. Client IP resolution is a hop count

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Client-IP resolution behind a proxy is a hop count (`TRUSTED_PROXY_HOPS`), not a boolean: a boolean cannot express how many proxies to trust, so `false` collapses every per-IP rate limit into one bucket while `true` makes them evadable by a forged header. Counting from the right reads a position written by controlled infrastructure. Misconfiguration in either direction is detected and warned about, and the resolved address is logged once at start so an operator can verify it in seconds

## Detail

**ADR-068 detail:** `TRUST_PROXY` defaulted to `false` while ADR-[037](./0037-session-and-owner-access-cookies-require-secure-https.md) made
HTTPS a deployment requirement and identified the target population as
self-hosters behind hobbyist reverse proxies — so the documented
deployment and the default configuration were in direct conflict. Behind
a proxy with the flag unset, every request presents the proxy's address
and all five per-IP thresholds in §[3.21](../spec/threat-model.md) become one global bucket: five
mistyped keys lock out an entire guest list for fifteen minutes, which at
a physical event with a printed key is not an edge case.

Flipping the default was rejected as the more dangerous error. A boolean
`true` means trusting any `X-Forwarded-For`, and an attacker rotating
that header evades every limit in the table including `CREATE_SECRET`.
Both settings being wrong is the signal that the type is wrong: the real
question is not whether to trust a proxy but how many sit in front, and
only a count answers it.

The mechanism is narrow and worth stating precisely, because it is easy
to over-trust. Each proxy *appends* to `X-Forwarded-For` the address of
the peer it received from, so the header grows left-to-right as a request
travels inward and the rightmost entries are the ones the operator's own
infrastructure wrote. Reading the Nth entry from the right is therefore
invariant to however much an attacker prepends: forge a hundred entries
and the real address is still Nth from the right. Reading from the left —
`XFF[0]` — is the classic vulnerability, that position being entirely
attacker-supplied.

What the count does not protect against: a proxy configured to overwrite
rather than append (nginx's `$remote_addr` versus
`$proxy_add_x_forwarded_for`) shifts the arithmetic silently, which is
why the resolved address is logged once at start — the count is a claim
about topology and the log is how it gets checked; a count set too high
reads leftward into attacker-controlled entries, which is why an
over-high value warns and falls back rather than trusting what it finds;
and a request reaching the app directly bypasses the chain entirely,
which is where Cloudflare Tunnel is genuinely stronger than a
self-hosted nginx, since with no public port there is no path around the
edge for a forged header to enter.

A CIDR allowlist was considered as more precise and rejected for this
audience: it asks a hobbyist to know their Docker network topology, where
a hop count asks a question the quickstart can simply answer. Reading
`CF-Connecting-IP` was also considered — on the Tunnel path it is simpler
and harder to get wrong, since Cloudflare strips any inbound copy — but
rejected as vendor-specific, given the spec continues to support
nginx/Caddy/Traefik operators; a Tunnel-only deployment could reasonably
use it instead. Refusing to start on suspected misconfiguration was
rejected too: the signal is a request header, uncheckable at boot, and an
outage during an event is worse than degraded limits during one.

This is a mechanism defect, not a threshold question, and deliberately
does not re-tune ADR-[042](./0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md)'s numbers. It does mean that test was measuring
the wrong configuration; §[3.13](../spec/testing.md) now runs three: direct, behind a
misconfigured proxy, and behind shared VPN egress.
