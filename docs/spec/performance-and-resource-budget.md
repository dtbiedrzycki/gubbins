# Performance & resource budget

- **Target hardware**: Raspberry Pi 4-class device, 256MB RAM ceiling for the
  app container.
- **API latency (p95)**: reads < 150ms; transactional writes (hold,
  contribution) < 300ms.
- **Guest page FCP**: < 2.5s on simulated 4G, no CDN.
- **Bundle budget**: guest-flow JS < 150KB gzipped; owner dashboard
  code-split separately, no hard ceiling (far fewer users, less latency-
  sensitive).
- **Concurrency target**: ~20 concurrent guest sessions served comfortably;
  beyond that, graceful degradation (slower responses), not failure — no
  request queue, existing rate limiting is sufficient backpressure.
- **256MB decomposition**: `--max-old-space-size=128` for V8;
  `PRAGMA cache_size` capped small (~8MB); image
  fetch/resize concurrency capped at 1, streaming resize rather than
  full-decode, upload size capped; ~60-80MB reserved for OS/container
  overhead.
- Targets are budgets verified by a load test against real Pi hardware
  (see [testing](testing.md)), not guarantees enforced at runtime. *(ADR-[029](../adr/0029-performance-resource-targets-set-for-pi-class-hardware.md))*
- A write flood against the single SQLite writer (WAL mode, single-writer)
  degrades latency but cannot corrupt state — this is an accepted instance
  of the "graceful degradation, not failure" stance above, not a
  correctness gap requiring new machinery.

---

[← Back to spec index](README.md)
