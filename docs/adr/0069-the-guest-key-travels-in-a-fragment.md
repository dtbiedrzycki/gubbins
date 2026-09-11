# 0069. The guest key travels in a fragment

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

The guest key travels in the URL fragment (`/{slug}#key=`), not the query string, and is POSTed to the existing key-entry endpoint by a same-origin script. Fragments are never transmitted, so the key reaches no proxy, edge, or access log — closing the intermediary exposure ADR-[022](./0022-guest-key-travels-in-the-invitation-url-transport.md) disclosed as unsolvable, which became load-bearing once Cloudflare Tunnel became the recommended path and its edge logs were outside the operator's control. Browser history for the tapped link remains the one unmitigable residue

## Detail

**ADR-069 detail:** ADR-[022](./0022-guest-key-travels-in-the-invitation-url-transport.md) put the guest key in a query string and
disclosed the residual exposure — browser history and reverse-proxy logs
— as "not fully solvable," mitigating what it could by documenting
query-string redaction in the operator's proxy config. Making Cloudflare
Tunnel the recommended path (§[3.20](../spec/governance-licensing-and-release.md)) broke that mitigation: the key
reaches Cloudflare's edge logs before the redirect strips it, and the
operator cannot configure redaction there. The recommended path became
the one where the recommended mitigation was unavailable.

Fragments solve it at every intermediary at once. RFC 3986 makes the
property normative rather than incidental: interpretation of a fragment
is performed solely by the agent dereferencing the URI, it is not passed
to other systems during retrieval, and redirection does not account for
it. So the key reaches no proxy, no edge, and no access log — access logs
record request lines, not bodies, and the key is now a POST body field
on the same endpoint manual entry already used.

This is a repurposing, not intended use. Fragments were specified to
identify part of a resource. But it is an established idiom with
standards precedent: OAuth 2.0's implicit flow returned access tokens in
the fragment for exactly this reason, and client-side-encrypted
pastebins put decryption keys there so the server never sees them — the
closer analogy, being a secret placed by the link's sender and read by a
same-origin script.

That precedent was deprecated, and the reasons deserve stating rather
than eliding. The OAuth 2.0 Security BCP cites fragment-borne tokens
being exposed to browser history, referrer headers, and any JavaScript
running on the page. Taken in turn: browser history applies, is
unavoidable, is identical under the query string, and was already
disclosed by ADR-[022](./0022-guest-key-travels-in-the-invitation-url-transport.md); referrer headers do not, since fragments are never
included in `Referer` — it is the query string that leaks that way, which
argues for this change rather than against it; and page JavaScript is the
substantive one, already neutralised here by §[3.7](../spec/privacy.md)'s strict CSP, absence
of inline scripts, and zero third-party origins. The remaining
deprecation reasons — token injection, absent sender-constraining —
presuppose a redirect from a third-party authorization server, of which
there is none. **The CSP dependency is load-bearing: if a future change
ever admits a third-party script, this decision degrades and should be
revisited.**

The cost is a JavaScript dependency on an entry path that previously had
none — a small piece of client-side credential handling in a flow that
was pleasingly dumb. §[3.16](../spec/accessibility-and-browser-support.md)'s graceful-degradation requirement is not
breached: it governs the hold and contribute flows, and the failure mode
here is falling back to the manual key-entry page that already exists for
printed invitations. Two consequences are stated rather than assumed: the
`pino` redact path moves from query string to POST body, and key entry
becomes a state-changing unauthenticated POST needing `SameSite` and
origin checking — a control the manual form required already.
