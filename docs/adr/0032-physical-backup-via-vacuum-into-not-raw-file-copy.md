# 0032. Physical backup via VACUUM INTO, not raw file copy

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Physical backup via `VACUUM INTO`, not raw file copy, due to WAL-mode consistency risk

## Detail

**ADR-032 detail:** A plain filesystem copy of the SQLite file under WAL mode risks capturing an inconsistent snapshot unless the `.db`, `-wal`, and `-shm` files are copied atomically together, which is easy to get wrong in operator scripts. `VACUUM INTO` runs safely against a live database and produces a single consistent, compacted file, at the cost of a brief write pause proportional to DB size (acceptable given target scale).
