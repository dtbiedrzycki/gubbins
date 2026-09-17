# 0067. The guest key travels in a fragment

- **Status:** Accepted (supersedes the prior query-string design, merged into this entry)
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Guests reach a list via an invitation link carrying a shared key, since most
arrive from a text message and won't reliably type a speakable key correctly
on a phone keyboard ([access & identity](../spec/access-identity.md)). The
key originally traveled as a query parameter (`?key=`): the server validated
it, set the session cookie, and issued a 302 redirect to strip it from the
address bar. That design knowingly left two exposures undisclosed as
unsolved: the browser's own history entry for the tapped link (unavoidable
client-side, the same limitation every password-reset link has), and
reverse-proxy/CDN access logs sitting outside the application's control —
mitigated only by documentation recommending query-string redaction at the
operator's proxy.

Making Cloudflare Tunnel the recommended deployment path
([governance, licensing & release](../spec/governance-licensing-and-release.md))
broke that mitigation: the key now reached Cloudflare's edge logs before the
redirect could strip it, and the operator has no way to configure redaction
there. The recommended deployment path became exactly the one where the
recommended mitigation was unavailable.

## Decision

We will move the guest key into the URL fragment (`/{slug}#key=`), not
the query string; it is POSTed to the existing key-entry endpoint by a
same-origin script. Per RFC 3986, a fragment is interpreted solely by the agent
dereferencing the URI — it is never sent to a server, so it reaches no
proxy, edge, or access log. This closes the intermediary exposure the
query-string design could only document around; the application's own logs
already excluded the query string on this route, and the key is now a POST
body field the `pino` redact path also excludes.

This repurposes fragments from their specified use (identifying part of a
resource), but follows established precedent: OAuth 2.0's implicit flow
returned access tokens this way, and client-side-encrypted pastebins place
decryption keys there for the same reason — the closer analogy, being a
secret placed by the link's sender and read by a same-origin script. That
precedent was later deprecated by the OAuth 2.0 Security BCP for three
reasons, addressed in turn: browser-history exposure applies but is
identical under the query string and was already disclosed; referrer-header
leakage does not apply, since fragments are never sent in `Referer` (query
strings are, which argues for this change rather than against it); and
page-JavaScript exposure is neutralized by the strict CSP, absence of inline
scripts, and zero third-party origins already required by
[privacy](../spec/privacy.md). The remaining deprecation reasons (token
injection, absent sender-constraining) presuppose a redirect from a
third-party authorization server, which this flow has none of.

## Alternatives considered

- **Query string (`?key=`) with a server-side redirect to strip it** — the
  original decision: the server validated the key, set the session
  cookie, and 302-redirected to the clean URL. Rejected once
  Cloudflare Tunnel became the recommended path: the key reaches
  Cloudflare's edge logs before the redirect runs, and the operator
  cannot configure redaction there. Its browser-history residue was
  already disclosed as unmitigable and carries forward unchanged.
- **"Short session lifetime" as a mitigation** — considered and withdrawn:
  if the key leaks from history or a log, whoever reads it enters it
  themselves and gets a fresh session, so the original guest's session
  expiring doesn't address the threat.

## Consequences

- Closes the reverse-proxy/edge-log exposure at every intermediary,
  including Cloudflare Tunnel, without operator configuration.
- Browser-history retention of the originally-tapped link remains a
  disclosed, unmitigable residual risk — identical under both designs, and
  unchanged by this decision.
- Adds a JavaScript dependency to an entry path that previously had none: a
  same-origin script now POSTs the fragment to the key-entry endpoint. This
  does not breach
  [accessibility & browser support](../spec/accessibility-and-browser-support.md)'s
  graceful-degradation requirement (which governs the hold/contribute flows
  specifically) — the fallback is the manual key-entry page that already
  exists for printed invitations.
- Key entry becomes a state-changing unauthenticated POST, needing
  `SameSite` and origin checking — a control the manual entry form already
  required.
- **Load-bearing dependency, stated explicitly:** this decision relies on
  the strict CSP, no inline scripts, and zero third-party origins
  ([privacy](../spec/privacy.md)) to neutralize page-JavaScript exposure. If
  a future change ever admits a third-party script, this decision degrades
  and should be revisited.
- Supersedes the prior query-string design in full. Its reasoning —
  guests arrive from a text message and won't reliably type a key — and
  its browser-history exposure both carry forward, as recorded above, so
  no separate record of it is kept.
