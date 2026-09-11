# 0031. Logging/metrics/tracing standardized on pino + OpenTelemetry

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Logging/metrics/tracing standardized on `pino` + OpenTelemetry SDKs; metrics stay pull-based via Prometheus exporter; trace export defaults to none and requires explicit operator-configured OTLP endpoint to leave the container

## Detail

**ADR-031 detail:** Hand-rolled logging/metrics were rejected in favor of standard, widely-supported libraries (`pino`, OpenTelemetry) now that the shape of what's needed is clear — this isn't premature adoption, it's picking boring, maintained tooling over bespoke code for a cross-cutting concern. Tracing's default-off export preserves the no-outbound-requests guarantee: spans exist for local/stdout debugging only unless an operator deliberately configures their own collector endpoint, which is the operator's choice about their own infrastructure, not the app initiating unsolicited contact with a third party.
