# 0044. Anonymous contributions resolved: name required, owner-only

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Anonymous contributions resolved: name always required (thank-you/reconciliation depend on it), but names are never shown to other guests — only the owner sees identity, gated by existing spoiler toggles. No per-list toggle for guest-visible names

## Detail

**ADR-044 detail:** Full guest-visible anonymity was rejected because it breaks two load-bearing views: the reconciliation view exists specifically to match incoming Zelle/Venmo payments against pledges by name, and the thank-you view has no attribution target without one. Full owner-side anonymity (owner also doesn't see the name) was also rejected for the same reason. The middle ground — required name, visible only to the owner — preserves both dependent views while addressing the actual concern (givers not wanting to be identified *to other guests*, e.g. a shy relative or a small top-up amount).

Superseded in part by ADR-[059](./0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md) and ADR-[060](./0060-guest-self-service-data-access-erasure-via-guestdataaccess.md): a name is required at
creation, but redaction may null it afterwards, by either the owner's or
the guest's action. The thank-you view accordingly tolerates a missing
attribution target where this ADR assumed one was guaranteed — an
erasure right outranks a bookkeeping convenience. "Always required"
should be read as "required at creation," matching the §[2](../spec/domain-model.md) invariant's
wording.
