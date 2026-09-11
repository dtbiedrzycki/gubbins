# 0022. Guest key travels in the invitation URL (transport superseded by 069)

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Guest key may travel in the invitation URL (`?key=`); server sets the session cookie then redirects to strip it from the URL bar and never logs it. Browser-history retention of the original link is a disclosed, unavoidable limitation, not a guarantee

## Detail

**ADR-022 detail:** Most guests arrive from a text message and will not reliably type a speakable key correctly on a phone keyboard, so the invitation link embeds the key as a query parameter. The server validates it, sets the session cookie, and issues a server-side 302 redirect to the clean `/{slug}` URL so the address bar and any subsequent navigation are clean. This is explicitly **not** a claim that the key never touches any log or history anywhere: the browser's own history entry for the originally-tapped link is unavoidable client-side (the same limitation every password-reset-link flow has), and reverse-proxy/CDN access logs sit outside the application's control — those were mitigated via documentation (recommend query-string redaction
at the proxy), not eliminated — and are eliminated outright by ADR-[069](./0069-the-guest-key-travels-in-a-fragment.md)'s
move to a fragment, which is why the transport changed. "Short session
lifetime" was also cited here as a mitigation and was never one: if the
key leaks from history or a log, whoever reads it enters it themselves
and receives a fresh session, so the original guest's cookie expiring is
irrelevant to the threat. The claim is withdrawn rather than
recalculated. The application's own logs exclude the query string on this route by design.

Transport superseded by ADR-[069](./0069-the-guest-key-travels-in-a-fragment.md). The reasoning above — that guests arrive
from a text message and cannot reliably type a speakable key on a phone
— stands, and the link still carries the key. What changed is where: the
fragment rather than the query string, so the key is never transmitted to
any server and the "reverse-proxy logs sit outside the application's
control" limitation recorded here is eliminated rather than documented
around. The browser-history limitation remains exactly as described. The
change was forced by Cloudflare Tunnel becoming the recommended
deployment path, which put the key in a third party's logs the operator
cannot configure at all.
