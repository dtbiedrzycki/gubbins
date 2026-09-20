# Observability (logging, metrics, tracing)

- **Logging**: structured JSON via `pino`. Request-scoped context (method,
  path, status, duration, request id) via `pino-http`. PII redaction
  enforced via `pino` `redact` paths (names, emails, keys, tokens) —
  mechanically guaranteed, not just a stated convention. Log level via
  `LOG_LEVEL` (existing).
- **Metrics**: OpenTelemetry Metrics SDK internally; exported via the
  Prometheus exporter at `/metrics` (pull-based, operator-scraped, gated
  by `METRICS_ENABLED`, unauthenticated by design — operator's
  responsibility not to expose publicly). Content includes request latency
  histograms, WAL size, process RSS, reminder-job last-run,
  projection-rebuild duration, and periodic-task last-successful-run and
  last-run-duration, plus a count of emails nulled on the last run — so
  an operator can see the task silently failing rather than inferring it
  from a retention promise quietly going unmet. Using the OTel SDK rather than hand-rolled
  counters keeps the door open for richer instrumentation later without a
  rewrite. *(ADR-[031](../adr/0031-logging-metrics-tracing-standardized-on-pino-opentelemetry.md))*
- **Tracing**: OpenTelemetry Tracing SDK. Span exporter defaults to
  **none** (spans created in-process only, optionally dumped to stdout at
  debug level for local troubleshooting) — nothing leaves the container
  by default. An operator may set `OTEL_EXPORTER_OTLP_ENDPOINT` to point
  at their own collector; this is an explicit, informed opt-in by whoever
  runs the box, not the application reaching out unprompted, so it does
  not conflict with the no-outbound-requests principle. *(ADR-[031](../adr/0031-logging-metrics-tracing-standardized-on-pino-opentelemetry.md))*
- Every request carries a generated request id, attached to its log
  lines, its active span, and returned as `X-Request-Id` — sufficient
  correlation for single-instance self-hosted debugging without requiring
  a trace backend.

---

[← Back to spec index](README.md)
