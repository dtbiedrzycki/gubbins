# Front-end architecture


**Does not mirror Clean Architecture.** Domain logic is server-side; duplicating rules client-side guarantees drift.

- **One API boundary**: all HTTP in `src/api/`, typed. Nothing else calls `fetch`.
- **Feature folders**, not type folders: `src/features/holds/`, `src/features/contributions/`
- **TanStack Query for server state** — caching, refetch, optimistic updates. Not `useState` + `useEffect`.
- **Shared types package** generated from zod schemas, so backend renames break the front-end build
- Dumb components; logic in hooks (`useHoldItem()`). Hooks are the testability seam.
- Pure display helpers (currency, percentage) may be shared. Policy logic may not.


---

[← Back to spec index](README.md)
