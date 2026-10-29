# 0062. The owner token never travels in a URL

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

[Threat model summary](../spec/threat-model-summary.md) listed "key/token
interception via the `?key=` URL" as mitigated by
ADR-[067](./0067-the-guest-key-travels-in-a-fragment.md), but ADR-067 and
[access & identity](../spec/access-identity.md) only ever specified the
transport mechanism for the guest key — how the owner presents their
token was never stated anywhere. The threat row therefore claimed
coverage the spec did not provide.

## Decision

We will never carry the owner token in a URL: entry is a paste into the
existing homepage input, setting the owner-access cookie, with no
`?token=` link and no bookmarkable manage URL holding the credential.
The owner-access cookie lasts the browser session (no `Max-Age`); the
guest cookie lasts 30 days.

## Alternatives considered

- **Mirror the original query-string design**
  (`/wishlists/{slug}/manage?token=`, validate, redirect to strip) — rejected.
  ADR-067's Alternatives considered section documents this same shape,
  already rejected for the guest key, and its justification is
  explicitly audience-specific: most guests arrive from a text message
  and cannot reliably type a speakable key on a phone keyboard. None of
  that describes the owner, who is one person at a keyboard at creation
  time, already being shown a screen whose entire purpose is saving a
  credential — so ADR-067's guest-specific convenience reasoning does not
  transfer. The stakes are also asymmetric: a leaked guest key grants
  browse and claim, while a leaked owner token grants rotation,
  redaction, deletion, and the invite QR, which itself reveals the guest
  key — so an owner-link leak is total compromise. That query-string
  design's residual risks (browser history, reverse-proxy logs, and
  under the Cloudflare Tunnel setup documented in
  [governance, licensing & release](../spec/governance-licensing-and-release.md),
  a third party's logs the operator does not control at all) were
  unmitigated by design for the owner token specifically — ADR-067's
  fragment-based transport later closed all but browser history for the
  guest key, but the owner token was never routed through either design.
- **A bookmarkable manage URL, for convenience** — rejected, in both a
  query-string and a fragment form. A fragment variant, mirroring
  ADR-[067](./0067-the-guest-key-travels-in-a-fragment.md)'s guest-key
  transport, would close the proxy/edge-log exposure the query-string
  variant carries — but that is not the objection that matters here.
  ADR-067 discloses browser-history retention as identical and
  unmitigated under either transport, and a *bookmarked* link is
  persistence by design — the opposite of what a credential granting
  rotation, redaction, deletion, and the invite QR should have sitting at
  rest indefinitely, in history or in a bookmarks bar. Nor does a fragment
  buy what it buys the guest key: that transport's value is carrying a
  secret across a channel the sender doesn't control (a text message,
  typed on a phone); the project collects no owner email address, so
  there is no send-a-link case to enable, only an owner bookmarking their
  own link at creation time, which needs no email either. The honest
  counter-argument stands regardless of transport: non-technical owners
  save links more reliably than they save tokens, and an owner who
  bookmarked a manage URL would never think about re-entry. Weighed
  against a full-control credential sitting at rest, and against the
  fact the owner must save *something* regardless, the trade favours
  excluding the token from URLs altogether.

## Consequences

- The chosen path required almost no new machinery:
  [access & identity](../spec/access-identity.md) already specifies a
  homepage input accepting "a list link, an owner token, or a slug+key
  pair" with smart-routing, and
  [threat model summary](../spec/threat-model-summary.md) already
  rate-limits "owner token entry" as a credential-proving route — both
  of which read as a POST rather than a link. This decision makes the
  token *only* travel that way, and renames the acknowledgement screen
  accordingly.
- The accepted cost is one paste per browser session. The owner saved
  the token, so re-entry is one paste; the list is deleted at `purgeAt`
  regardless.
- [Governance, licensing & release](../spec/governance-licensing-and-release.md)'s
  reverse-proxy examples recommend query-string redaction on the
  `?key=` route and need no second route added, since the owner token
  never appears in a query string.
