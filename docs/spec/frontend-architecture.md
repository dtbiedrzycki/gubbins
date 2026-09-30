# Front-end architecture

**Does not mirror Clean Architecture.** Domain logic is server-side; duplicating rules client-side guarantees drift.

- **One API boundary**: all HTTP in `src/api/`, typed. Nothing else calls `fetch`.
- **Feature folders**, not type folders: `src/features/holds/`, `src/features/contributions/`
- **TanStack Query for server state** — caching, refetch, optimistic updates. Not `useState` + `useEffect`.
- **API types generated from the OpenAPI document** (`apps/api/openapi.json`, itself generated from the zod route schemas — ADR-[077](../adr/0077-openapi-document-generated-from-route-schemas-is-the-api-contract.md)), so backend renames break the front-end build
- Dumb components; logic in hooks (`useHoldItem()`). Hooks are the testability seam.
- Pure display helpers (currency, percentage) may be shared. Policy logic may not.

---

[← Back to spec index](README.md)
