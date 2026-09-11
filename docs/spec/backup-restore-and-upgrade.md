# Backup, restore & upgrade safety

- **Logical backup**: existing JSON export/import (§[3.11](ops.md)) — portable,
  human-inspectable, engine-version-independent. The export includes
  `guest_pii` rows with their `redactedAt` values, since omitting them
  would leave every `piiRef` dangling on restore. Import preserves
  `redactedAt`; where a row already exists in the target database with
  `redactedAt` set, redaction wins regardless of the incoming value, so
  a partial or repeated import can never un-redact. *(ADR-[067](../adr/0067-erasure-across-backups-and-the-subject-access-routing-fix.md))*
- **Physical backup**: `VACUUM INTO <path>` against the live WAL-mode
  database — safe to run without stopping the container, produces one
  consistent, compacted snapshot file. Plain filesystem copy of the `.db`
  file is **not** safe under WAL mode (may miss in-flight WAL/SHM state)
  and must not be documented as a supported method. *(ADR-[032](../adr/0032-physical-backup-via-vacuum-into-not-raw-file-copy.md))*
- Both backup methods are documented operator recipes (a bundled script,
  invoked via `docker exec`), not a built-in scheduler — scheduling stays
  the operator's cron, consistent with the single-container/no-separate-
  DB-service posture in §[3.11](ops.md).
- Deployment guide (Cluster F) must recommend copying backups off-device,
  since the default target (Pi + SD card) is failure-prone.
- **Backup retention**: keep rotating backups for at most 30 days, and
  never longer than `PURGE_AFTER_DAYS` (§[3.11](ops.md)). A backup outliving the
  database it came from means personal data the live system has already
  deleted persists in a file the operator has probably forgotten. As
  with scheduling, rotation is the operator's cron and the guide
  supplies the recipe — but the window itself is not optional guidance:
  it is what makes the erasure-in-backups obligation (§[3.7](privacy.md))
  dischargeable, being the "specified length of time" a privacy notice
  has to state. *(ADR-[067](../adr/0067-erasure-across-backups-and-the-subject-access-routing-fix.md))*
- **Migrations are forward-only** (see §[3.11](ops.md)). Rollback story is "restore
  from the pre-upgrade backup," documented as a required pre-upgrade step,
  not "run a down migration." *(ADR-[033](../adr/0033-migrations-are-forward-only-rollback-restore-from-backup.md))*
- **Event schema evolution**: the existing payload `v` field is the seam.
  An upcaster layer (`infrastructure/events/upcasters/`) transforms
  older-versioned event JSON to the current shape before folding. New
  event types are additive only; existing types are never redefined in
  place. *(ADR-[033](../adr/0033-migrations-are-forward-only-rollback-restore-from-backup.md))*
- CI migration test: run every migration against a seeded copy of the
  prior schema version to catch failures pre-release.

---

[← Back to spec index](README.md)
