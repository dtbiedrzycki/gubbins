# Threat model

Full threat model (assets, actors, threat-by-threat enumeration) lives in
`docs/threat-model.md`. Summary below; this section is the authoritative
spec reference for the two items it resolves (constant-time comparison,
cookie/HTTPS requirement — both folded into §[3.1](access-identity.md) above) and for the
concrete rate-limit thresholds.

**Assets**: guest key, owner token, hold secrets, session cookies
(the access-control surface); guest PII (names, optional emails,
messages); claim-state secrecy (the "spoiler"); ledger integrity
(no double-spend, no silent overfunding bypass); instance availability
during the event window.

**Actors**: guest with valid slug+key; guest with only the slug (should
learn nothing, per §[3.1](access-identity.md)); owner; unauthenticated internet (default
assumption for an internet-facing app); a malicious/curious co-guest with
a valid key; a network attacker with proxy/log access; the hosting
operator (explicitly out of scope as an adversary, per §[1](../../gubbins-spec.md#non-goals)).

**Threats identified, each mapped to an existing or newly-added
mitigation:**

| Threat | Mitigation |
|---|---|
| Guessing/brute-forcing slug, key, token, or hold secret | Unguessable `TokenGenerator` output; rate limiting below; identical generic failure response (ADR-[016](../adr/0016-no-public-list-directory-lookups-fail-generically.md)) |
| Guest key interception in transit or at intermediaries | The key travels in a URL fragment, never transmitted to any server (ADR-[069](../adr/0069-the-guest-key-travels-in-a-fragment.md)), so it appears in no proxy, edge, or application access log; it is POSTed once over TLS with the body redacted from logs (§[3.19](observability.md)). The browser history entry for the originally tapped link remains a disclosed, unmitigable residual risk, as under ADR-[069](../adr/0069-the-guest-key-travels-in-a-fragment.md). The owner token is excluded from URL transport entirely (ADR-[064](../adr/0064-the-owner-token-never-travels-in-a-url.md)) |
| Rate-limit evasion via forged `X-Forwarded-For` | Client IP resolved by counting `TRUSTED_PROXY_HOPS` entries from the right, so only addresses appended by a trusted proxy are read and a client-supplied prefix is inert. A count set too high logs a warning and falls back leftward rather than trusting client input (ADR-[068](../adr/0068-client-ip-resolution-is-a-hop-count.md)) |
| Self-inflicted lockout via proxy misconfiguration | With the hop count unset behind a proxy, every guest shares one bucket and a handful of key typos locks out the whole list. Detected at request time, warned about, and the resolved address logged once at start; the quickstart and all reverse-proxy examples set it explicitly (ADR-[068](../adr/0068-client-ip-resolution-is-a-hop-count.md)) |
| Timing side-channel on secret comparison | Constant-time comparison, generalized to every secret comparison in the system (ADR-[036](../adr/0036-constant-time-comparison-generalized-to-all-secret.md)) |
| Session cookie theft (XSS, sniffing) | httpOnly, signed, list-scoped, `Secure`-flagged (ADR-[037](../adr/0037-session-and-owner-access-cookies-require-secure-https.md)); strict CSP with no inline scripts reduces XSS surface |
| SSRF via URL metadata fetching | Opt-in only, private-IP blocking, redirect blocking, timeouts (§[3.7](privacy.md)) |
| Stored XSS via name/message fields | Escaping on output; no rich text anywhere in the input model |
| Double-claim race on a quantity-1 item | `UNIQUE (itemId, seq)` optimistic concurrency, `BEGIN IMMEDIATE`, retry-with-re-evaluation (§[3.8](data-and-persistence.md)–[3.9](backend-architecture.md)); explicit concurrency test (§[3.13](testing.md)) |
| Overfunding bypass via stale/manipulated client-side remainder | Remainder recomputed server-side at submit time; policy centralized in `canAccept` |
| List/slug enumeration | No public directory; generic not-found responses (ADR-[016](../adr/0016-no-public-list-directory-lookups-fail-generically.md)), including for purged slugs — the post-purge response is identical to never-existed, not a distinguishable tombstone (ADR-[056](../adr/0056-post-purgeat-lookups-return-the-same-generic-not-found.md)) |
| DoS against a resource-constrained instance | Auth-route rate limiting (below); write-flood degrades latency, not correctness, under WAL mode (§[3.17](performance-and-resource-budget.md)) — accepted as "graceful degradation," not a gap |
| Data-at-rest theft (stolen DB file or backup) | Out of application scope by design — an operator/OS-level concern (encrypted volume, LUKS), named explicitly so it isn't silently assumed away (§[3.7](privacy.md)). Applies uniformly to all plaintext bearer secrets (guest key, owner token, hold secrets — ADR-[054](../adr/0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md)) |
| Owner impersonation via leaked shared owner token | Rotation, preserving history (ADR-[015](../adr/0015-owner-tokens-are-shared-per-list-not-per-owner.md)) |
| URI-scheme injection via owner-supplied payment handle | `custom` methods are text/QR only and never rendered as a link; deep links restricted to shipped provider templates with an `https:`-plus-declared-app-scheme allowlist. Instructions text escaped on output like names/messages (ADR-[046](../adr/0046-payment-methods-are-per-list-configuration-not-a-hardcoded.md)) |
| Ledger pollution or hold-hoarding by a guest with a valid key | Concurrent-hold cap per session (ADR-[048](../adr/0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md)); contribution sanity ceiling (ADR-[049](../adr/0049-contribution-amounts-bounded-by-absolute-and-target.md)); owner-side void and hold-release as the reversal path. Session-scoped caps are a blast-radius limiter, not an identity control — a determined actor clears cookies. Detection-and-reversal plus key rotation remains the real defence, consistent with the non-goals below |
| Duplicate pledge/hold from an accidental or replayed submit | Idempotency key persisted with a uniqueness constraint; replay returns the original result (ADR-[050](../adr/0050-hold-contribution-submits-carry-a-client-generated.md)) |
| Premature spoiler reveal via timezone ambiguity | `eventDate` resolved to instants through the list's IANA timezone rather than server-local midnight, so an event west of UTC cannot reveal early (ADR-[051](../adr/0051-civil-dates-and-instants-modelled-distinctly-via-per-list.md)) |
| Unpatched instance left running indefinitely after its event has passed | Documented teardown checklist (§[3.20](governance-licensing-and-release.md), ADR-[057](../adr/0057-instance-teardown-addressed-as-a-documentation-checklist.md)) — no active app-level enforcement; the dominant single-list deployment shape (ADR-[014](../adr/0014-list-creation-self-locks-gated-by-createsecret-thereafter.md), ADR-[053](../adr/0053-owner-token-recovery-deferred-direct-operator-access-is-the.md)) makes cross-list "everything's expired" tooling a poor complexity trade for now |
| Guest-data-access secret guessing | Unguessable `TokenGenerator` output; rate limiting below; same generic-failure response pattern as other lookups (§[3.1](access-identity.md), ADR-[060](../adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)) |
| Guest-data-access secret exposed via URL (link sharing, referrer, shoulder-surfing) | Grants access to that guest's own data only — no cross-guest or owner-level access — and the sole action beyond viewing is deleting that same guest's own data, so the worst case of a leaked secret is self-limited to one guest's own records |

**Explicit non-goals** (restated from §[1](../../gubbins-spec.md#non-goals) for the threat model's own
completeness): protection against a hostile server operator; protection
against a legitimately-keyed guest who shares their access outside the
invite list (a social/physical trust boundary, not a software one);
cryptographic non-repudiation of pledged payments (a threat the product
design accepts, not one the software fails to mitigate — payment rails are
unverifiable by design, per §[3.5](payments.md)); and *prevention* (as opposed to
limitation and reversal) of abuse by a guest who holds a valid key — the
caps in ADR-[048](../adr/0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md)/[049](../adr/0049-contribution-amounts-bounded-by-absolute-and-target.md) bound the damage a casual abuser can do in one session,
but a session identifier is not an identity and cannot be made into one
without accounts.

**Rate limiting — concrete thresholds.** Stored in a `rate_limit_attempts`
SQLite table, fixed-window, lazily expired the same way hold expiry is
(§[3.3](holds.md)) — no cron sweep, no new service dependency (§[3.8](data-and-persistence.md)). Every
lockout/slowdown state returns the same generic message as ADR-[016](../adr/0016-no-public-list-directory-lookups-fail-generically.md); a
distinct "too many attempts" message would itself leak slug existence.

| Route | Per-IP threshold | Lockout | Aggregate (per-slug) |
|---|---|---|---|
| Guest key entry | 5 failed / 15 min | 15 min | 30 failed/hr across all IPs → 2s added delay per attempt for 1hr (deliberately **not** a full slug lockout — a guest who knows the slug shouldn't be able to lock out the entire guest list by feeding it wrong keys on purpose) |
| Owner token entry | 5 failed / 15 min | 30 min | — (single credential; no meaningful aggregate) |
| Hold-secret link (`/{slug}/hold/{holdSecret}`) | 10 failed / 15 min | 15 min | — |
| Guest-data-access link (`/{slug}/my-data/{secret}`) | 10 failed / 15 min | 15 min | — |
| `CREATE_SECRET` | 5 failed / hr | 1 hr | — |

Counters reset on successful auth. *(ADR-[042](../adr/0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md))*

Note that the thresholds above govern **credential-proving routes only**.
Post-authentication guest writes are bounded separately and semantically,
not by rate limit — see the concurrent-hold cap (§[3.3](holds.md)), the contribution
sanity ceiling (§[3.4](group-gifts-and-funds.md)), and ADR-[048](../adr/0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md)'s reasoning on why a per-session write
throttle was considered and rejected in their favour.

**Flagged for empirical validation, not resolved by policy alone**:
per-IP thresholds assume one attacker per IP, but guests at a physical
event (wedding, shower) frequently share venue wifi — a realistic
false-positive path where several honest guests get bucketed as one
actor. Added to §[3.13](testing.md) as an explicit pre-v1 test: simulate many guests
on one IP and verify the false-positive rate before shipping these
numbers as final; adjust the **per-IP** threshold (not the per-slug one)
if it proves too aggressive. *(ADR-[042](../adr/0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md))*

---

[← Back to spec index](README.md)
