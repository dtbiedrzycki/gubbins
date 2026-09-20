# 0064. The owner token never travels in a URL

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

The owner token is never carried in a URL: entry is a paste into the existing homepage input, setting the owner-access cookie, with no `?token=` link and no bookmarkable manage URL holding the credential. ADR-[022](./0022-guest-key-travels-in-the-invitation-url-transport.md)'s convenience reasoning is guest-specific and does not transfer. Owner-access cookie is 30 days rolling or `purgeAt`, whichever is sooner

## Detail

**ADR-064 detail:** §[3.21](../../gubbins-spec.md#321-threat-model) listed "Key/token interception via the `?key=`
URL" as mitigated by ADR-[022](./0022-guest-key-travels-in-the-invitation-url-transport.md), but ADR-[022](./0022-guest-key-travels-in-the-invitation-url-transport.md) and §[3.1](../../gubbins-spec.md#31-access--identity) only ever specified
the mechanism for the guest key — how the owner presents their token was
never stated anywhere. The threat row therefore claimed coverage the spec
did not provide.

Mirroring ADR-[022](./0022-guest-key-travels-in-the-invitation-url-transport.md) (`/{slug}/manage?token=`, validate, redirect to strip)
was the obvious option and was rejected. ADR-[022](./0022-guest-key-travels-in-the-invitation-url-transport.md)'s justification is
explicitly audience-specific — most guests arrive from a text message and
cannot reliably type a speakable key on a phone keyboard — and none of it
describes the owner, who is one person at a keyboard at creation time,
already being shown a screen whose entire purpose is saving a credential.
The stakes are also asymmetric: a leaked guest key grants browse and
claim, while a leaked owner token grants rotation, redaction, deletion,
and the invite QR, which itself reveals the guest key. So an owner-link
leak is total compromise, and ADR-[022](./0022-guest-key-travels-in-the-invitation-url-transport.md)'s residual risks are unmitigated by
design — browser history, reverse-proxy logs, and under the Cloudflare
Tunnel setup documented in §[3.20](../../gubbins-spec.md#320-governance-licensing--release-process), a third party's logs the operator does
not control at all.

The chosen path required almost no new machinery: §[3.1](../../gubbins-spec.md#31-access--identity) already specifies
a homepage input accepting "a list link, an owner token, or a slug+key
pair" and smart-routing, and §[3.21](../../gubbins-spec.md#321-threat-model) already rate-limits "owner token
entry" as a credential-proving route — both of which read as a POST
rather than a link. This ADR decides that the token *only* travels that
way, and renames the acknowledgement screen accordingly.

The accepted cost is one paste per cookie expiry, and the honest
counter-argument is that non-technical owners save links more reliably
than they save tokens — an owner who bookmarked a manage URL would never
think about re-entry. Weighed against a bookmarked full-control URL
sitting in history and proxy logs, and against the fact that the owner
must save *something* regardless, the trade favours excluding the token
from URLs. A 30-day rolling cookie keeps re-entry rare: refreshed on each
authenticated request, it prompts only after genuine month-long absence,
which for a typical list falls outside the setup-and-reconcile window
`purgeAt` already bounds.

One documentation consequence: §[3.20](../../gubbins-spec.md#320-governance-licensing--release-process)'s reverse-proxy examples recommend
query-string redaction on the `?key=` route and need no second route
added, since the owner token never appears in a query string.
