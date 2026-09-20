# 0036. Constant-time comparison generalized to all secret comparisons

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Constant-time comparison generalized to all secret comparisons (owner token, hold secret, guest key verification, `CREATE_SECRET`), not `CREATE_SECRET`-specific

## Detail

**ADR-036 detail:** The spec had previously stated constant-time comparison only for `CREATE_SECRET` (§[3.11](../spec/ops.md)), which left it ambiguous whether owner-token, hold-secret, and guest-key comparisons followed the same rule. Generalized to a single blanket statement (§[3.1](../spec/access-identity.md)) covering every secret comparison in the system, closing a documentation gap identified while drafting the threat model rather than introducing new behavior — the intent was always general, this makes it explicit so no comparison path is inadvertently implemented with `===`.
