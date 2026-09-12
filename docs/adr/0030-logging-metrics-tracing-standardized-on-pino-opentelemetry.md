# 0030. Logging/metrics/tracing standardized on pino + OpenTelemetry

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Cross-cutting logging/metrics/tracing needs had grown past what
hand-rolled code should keep covering, and the project's
no-outbound-requests-by-default privacy posture
([privacy](../spec/privacy.md)) meant any new tracing capability had to
preserve that guarantee rather than quietly add a new way for the app to
reach out.

## Decision

We will standardize logging, metrics, and tracing on `pino` and the
OpenTelemetry SDKs; metrics stay pull-based via a Prometheus exporter;
trace export defaults to none and requires an operator-configured OTLP
endpoint to leave the container.

## Alternatives considered

- **Hand-rolled logging/metrics** — rejected: now that the shape of
  what's needed is clear, picking boring, maintained libraries (`pino`,
  OpenTelemetry) for a cross-cutting concern is preferable to bespoke
  code; this isn't premature adoption, it's foregoing a hand-rolled
  version of something with mature tooling already available.
- **Enabling trace export by default** — rejected: it would mean the app
  initiates outbound contact unprompted, breaking the
  no-outbound-requests guarantee; defaulting export to none until an
  operator deliberately configures their own collector endpoint keeps
  that choice with whoever runs the box.

## Consequences

- Logging, metrics, and tracing share standard, maintained tooling
  rather than three bespoke implementations.
- Metrics remain pull-based (Prometheus exporter), consistent with the
  app never initiating outbound calls of its own accord.
- Trace spans exist for local/stdout debugging by default; nothing
  leaves the container unless an operator explicitly sets an OTLP
  endpoint for their own infrastructure. See
  [observability](../spec/observability.md).
