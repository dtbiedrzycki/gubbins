# 0016. No public list directory; lookups fail generically

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Guest and owner access are both unguessable bearer secrets rather than
accounts (ADR-[001](./0001-no-accounts-slug-key-for-guests-owner-token-for-owners.md)):
a list is only supposed to be discoverable to someone who already holds
its slug, key, or token. Any surface that reveals whether a given slug
exists, or which part of a submitted credential was wrong, would let an
attacker enumerate lists or narrow down a guess — undermining the
unguessable-link model regardless of how strong the secrets themselves
are.

## Decision

We will never enumerate existing lists anywhere on the instance — no
public directory, no admin-facing listing reachable pre-auth — and every
failed slug/key/token lookup will return an identical, generic
"not found" response regardless of which part of the credential was
wrong or whether the list exists at all
([access & identity](../spec/access-identity.md)).

## Alternatives considered

- **A list directory, even a private or admin-facing one, reachable from
  the homepage** — rejected: creates a single place where the existence
  of every list is visible, which contradicts a model where a list is
  discoverable only to someone holding its slug.
- **Distinguishing failure reasons in lookup responses** (e.g., "list not
  found" vs. "wrong key" vs. "wrong token")** — rejected: a distinguishable
  response is an enumeration oracle — it tells an attacker which half of
  their guess was right, letting them narrow a brute-force search
  instead of guessing the whole secret at once.

## Consequences

- This is a **load-bearing precedent** other decisions build on directly
  rather than re-deriving: ADR-[056](./0056-post-purgeat-lookups-return-the-same-generic-not-found.md)'s
  post-purge lookups return this same generic response rather than a
  distinguishable "this list existed and was purged" message, and
  ADR-[058](./0058-owner-configurable-privacynotice-field-shown-only-when-set.md)'s
  owner-configurable privacy notice renders identically on every failed
  and successful gate attempt so its presence or absence adds no
  per-slug signal of its own.
- Combined with unguessable `TokenGenerator` output and rate limiting
  (ADR-[042](./0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md)),
  this closes the enumeration/guessing vector for slugs, keys, tokens,
  and hold secrets alike — none of the three mechanisms is sufficient
  alone.
- Any future feature that surfaces list state pre-authentication must be
  checked against this rule before shipping, since it's easy to
  accidentally reopen the oracle by adding a seemingly harmless
  distinguishing detail to a failure response.
