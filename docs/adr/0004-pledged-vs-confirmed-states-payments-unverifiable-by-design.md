# 0004. Pledged vs. confirmed states; payments unverifiable by design

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The app supports many payment methods (Venmo, Zelle, bank transfer, cash,
and more) as display-only definitions, not payment integrations, and by
design never calls a payment API, holds funds, or receives a webhook
confirming receipt ([payments](../spec/payments.md)). Guests and owners
still both need to see progress toward a gift, so the system needs some
notion of payment status even though it cannot verify any of it.

## Decision

We will track exactly two contribution states — `pledged` (the guest's
own unverifiable assertion that they've sent money) and `confirmed` (the
owner has manually reconciled receipt) — and render both honestly (e.g.,
solid progress for confirmed, hatched/ghosted for pledged) rather than
implying verification that doesn't exist.

## Alternatives considered

- **Payment-processor integration to verify receipt programmatically** —
  rejected: contrary to the project's zero-outbound-request, no-accounts,
  self-hosted design; would require the app to hold funds or integrate
  per-provider APIs, exactly the operational burden a self-hosted casual-
  event tool is meant to avoid.
- **A single "paid" state with no pledged/confirmed distinction** —
  rejected: would falsely present an unverifiable guest assertion as
  owner-confirmed fact, misleading the owner during reconciliation.
- **Trusting the guest's assertion alone as final, with no owner
  confirmation step** — rejected: gives the owner no way to correct a
  false or premature claim before it's treated as settled.

## Consequences

- The owner must manually reconcile; the app can never claim a payment is
  verified.
- Every downstream feature involving money — group gifts
  (ADR-[003](./0003-group-gift-contributions-go-to-the-owner-no-designated-buyer.md)),
  manual contributions, currency handling
  (ADR-[061](./0061-currency-validation-minor-unit-storage-and-the-ceiling.md)) —
  inherits this pledged/confirmed split rather than a single settled state.
- UI must consistently distinguish the two states rather than collapsing
  them, or it would misrepresent what the app actually knows.
