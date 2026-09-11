# Ops


- Single container, SQLite on a mounted volume — no separate DB service in the default path
- Migrations run on boot; refuse to start on failure rather than serving a half-migrated schema
- **Migrations are forward-only.** No down-migrations are shipped or maintained.
  Rollback story is "restore from the pre-upgrade backup" (§[3.18](backup-restore-upgrade.md)), not "run
  a down migration." The app additionally refuses to start if the DB's
  recorded schema version is *newer* than the running app expects, to guard
  against a botched downgrade attempt. *(ADR-[033](../adr/0033-migrations-are-forward-only-rollback-restore-from-backup.md))*
- All config via env vars; secrets via `_FILE` convention
- Non-root user, multi-arch (amd64 + arm64), healthcheck endpoint
- Reverse-proxy friendly: subpath deployment, trusted proxy headers
- **Proxy misconfiguration is detected and warned about, not silently
  tolerated.** If `TRUSTED_PROXY_HOPS` is 0 and an inbound request
  carries `X-Forwarded-For`, the app logs a warning stating that per-IP
  rate limiting has degraded to a single instance-wide bucket, and names
  the variable to set. If the count exceeds the entries actually present,
  it logs that the value is too high and falls back to the leftmost
  available entry rather than trusting a client-supplied one. Neither is
  fatal — the signal is a request header, so it cannot be checked at
  boot, and a running instance with degraded limits serves an event
  better than one that refuses to start during it.
- **On first request after start, the resolved client address is logged
  once at info level** alongside the raw header and the configured hop
  count. An operator checks their logs and sees either a real client
  address or `127.0.0.1` — ten seconds to verify, against discovering it
  mid-event when everyone is locked out. This matters because the hop
  count is a claim about topology that a single overwriting proxy
  (nginx's `$remote_addr` rather than `$proxy_add_x_forwarded_for`) can
  silently invalidate. A log line rather than a header-echoing endpoint,
  which would be both an information leak and something to abuse.
  *(ADR-[068](../adr/0068-client-ip-resolution-is-a-hop-count.md))*
- SMTP optional and off by default. **SMTP is a capability flag** — when unconfigured, the UI must not offer or imply reminders. Creation-gating does **not** depend on SMTP (see ADR-[014](../adr/0014-list-creation-self-locks-gated-by-createsecret-thereafter.md)); email delivery reliability is not on the critical path for onboarding.
- JSON export/import for full data portability (logical backup); physical
  backup via `VACUUM INTO` (see §[3.18](backup-restore-upgrade.md))
- Structured logs to stdout via `pino`; `/health`; optional `/metrics` and
  tracing (see §[3.19](observability.md)). No outbound anything by default.

**Env var reference:**

| Var | Purpose | Default |
|---|---|---|
| `PORT` | HTTP listen port | `3000` |
| `BASE_URL` | Absolute URL base for links in emails | — (required if SMTP set) |
| `DATABASE_PATH` | SQLite file location | `./data/wishlist.db` |
| `CREATE_SECRET` | One or more comma-separated invite secrets; presenting any valid value authorizes list creation once the instance has self-locked | unset |
| `ALLOW_OPEN_CREATION` | Bypass the self-lock; creation always open, no secret required | `false` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Hold-expiry reminder email | unset → reminders disabled, warning logged |
| `TRUSTED_PROXY_HOPS` | Number of reverse proxies in front of the app. `0` = none, read the socket address. `1` or more = read the address the outermost trusted proxy appended to `X-Forwarded-For`, counting from the right, so a client-supplied header value cannot be mistaken for the real one. The quickstart's Tunnel-plus-local-proxy path is `2`. Must be set correctly or per-IP rate limiting (§[3.21](threat-model.md)) is either evadable (too high) or collapses into a single global bucket (too low) | `0` |
| `DEFAULT_TIMEZONE` | IANA fallback when browser detection is unavailable at list creation | `UTC` |
| `MAX_ACTIVE_HOLDS_PER_SESSION` | Concurrent active holds one guest session may have across a list | `10` |
| `MAX_CONTRIBUTION_TARGET_MULTIPLE` | Ceiling as a multiple of `targetMinor`, where a target exists | `5` |
| `HOLD_DURATION_DAYS` | Initial hold length; the single self-service extension adds the same again | `3` |
| `PURGE_AFTER_DAYS` | Days after `eventDate` before the whole list is deleted. Minimum 1. Applies to existing lists on change, since `purgeAt` is derived — treat as set-once for an instance serving live lists | `90` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `NODE_ENV` | Runtime mode | `production` |
| `METRICS_ENABLED` | Expose `/metrics` (Prometheus text format via OpenTelemetry exporter); pull-based, scraped by the operator's own tooling — does not violate the no-outbound-requests principle since nothing leaves the box unprompted | `false` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Operator-supplied collector for trace export; unset = spans stay in-process only, never leave the container | unset |
| `SOURCE_URL` | AGPL-3.0 compliance: link surfaced in the footer/about page pointing to the source of the code actually running. Defaults to the upstream repo; **operators who modify the code are responsible for updating this** to their own fork before serving guests, per AGPL §13's network-use clause | upstream repo URL |

Notes on `CREATE_SECRET`:
- Each comma-separated value is an independent, symmetric capability token — not a per-identity credential. There is no email, verification flow, or identity storage involved (rejected as inconsistent with the no-accounts principle; see ADR-[014](../adr/0014-list-creation-self-locks-gated-by-createsecret-thereafter.md) rationale).
- Revoke one invitee by removing their value and restarting the container; other values are unaffected.
- Values should be high-entropy random strings generated the same way as guest keys and owner tokens (via `TokenGenerator`), not admin-chosen passphrases. A `generate-invite-secret` CLI helper is provided for this.
- Incoming values are checked with constant-time comparison, not `===` (generalized in ADR-[036](../adr/0036-constant-time-comparison-generalized-to-all-secret.md) to apply to all secret comparisons, not just this one).

### 3.12 Development environment

---

[← Back to spec index](README.md)
