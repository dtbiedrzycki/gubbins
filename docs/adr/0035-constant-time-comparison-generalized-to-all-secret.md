# 0035. Constant-time comparison generalized to all secret comparisons

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The spec previously required constant-time comparison only for
`CREATE_SECRET` ([ops](../spec/ops.md)), leaving it ambiguous whether
owner-token, hold-secret, and guest-key comparisons followed the same
rule. This gap was identified while drafting the threat model
(ADR-[034](./0034-threat-model-documented-in-docs-threat-model-md.md)),
not from any change in intent — the rule was always meant to be general.

## Decision

We will state constant-time comparison as a single blanket requirement
([access & identity](../spec/access-identity.md)) covering every secret
comparison in the system — owner token, hold secret, guest-key
verification, and `CREATE_SECRET` alike — rather than a `CREATE_SECRET`-
specific rule.

## Alternatives considered

- **Leave the requirement scoped to `CREATE_SECRET` only** — rejected:
  leaves owner-token, hold-secret, and guest-key comparisons undocumented,
  risking an inadvertent `===` implementation on a path the spec never
  explicitly covered.

## Consequences

- No comparison path in the system may use a non-constant-time equality
  check (`===` or equivalent) against a secret value.
- Closes a documentation gap rather than introducing new behavior; no
  implementation change was required, only making an already-intended
  rule explicit.
