# 0019. Quantity may drop below committed holds/purchases

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Quantity may drop below committed holds/purchases; existing commitments grandfathered, new holds blocked until under the new quantity

## Detail

**ADR-019 detail:** Blocking quantity reduction below the committed count was considered and rejected as inconsistent with the overfunding-allowed philosophy elsewhere in the spec — the system already tolerates "more claimed than perfectly planned" for money; doing the same for item counts avoids penalizing guests who already committed in good faith.
