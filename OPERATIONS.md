# GEMS Platform – Operations Guide

This document covers backup/restore, Row Level Security (RLS), and the system tenant required for audit logging.

---

## 1. Backup and Restore Strategy

### 1.1 Database backup

- **Script:** `scripts/backup-database.sh`
- **What it does:** Runs `pg_dump` for the platform database, optionally compresses the output (gzip/bzip2/xz), writes a manifest, and prunes backups older than the retention period.
- **Environment variables (optional):**
  - `BACKUP_DIR` – output directory (default: `/backups/database`)
  - `RETENTION_DAYS` – keep backups for N days (default: `30`)
  - `COMPRESSION` – `gzip`, `bzip2`, `xz`, or `none`
  - `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` – DB connection (defaults match Docker Compose)
- **Example (host):**
  ```bash
  export POSTGRES_HOST=localhost POSTGRES_PASSWORD=your_password
  ./scripts/backup-database.sh
  ```
- **Example (Docker):**
  ```bash
  docker compose -f infrastructure/docker/docker-compose.yml exec postgres \
    bash -c 'BACKUP_DIR=/backups PGPASSWORD=$POSTGRES_PASSWORD ./path/to/backup-database.sh'
  ```
- **Scheduling:** Run daily via cron or a scheduler, e.g. `0 2 * * * /path/to/scripts/backup-database.sh`.

### 1.2 Database restore

- **Script:** `scripts/restore-database.sh`
- **Usage:** `./scripts/restore-database.sh <backup_file>`
- **Example:** `./scripts/restore-database.sh /backups/database/backup_platform_db_20260210_120000.sql.gz`
- **Behaviour:** Supports `.sql`, `.sql.gz`, `.sql.bz2`, `.sql.xz`. If the database already exists, the script prompts to drop/recreate before restore. Uses `POSTGRES_*` env vars (same as backup).
- **Important:** Restore replaces the current database; ensure no critical traffic is using it and that you have a backup of the current state if needed.

### 1.3 File storage backup (documents/uploads)

- **Script:** `scripts/backup-files.sh`
- **What it does:** Archives the document/file storage directory (e.g. uploaded PDFs), optionally compresses, and applies retention.
- **Environment variables:** `STORAGE_DIR`, `BACKUP_DIR`, `RETENTION_DAYS`, `COMPRESSION` (see script header).
- **Restore:** `scripts/restore-files.sh <backup-directory>` – restores files from a backup directory.

### 1.4 Recommended practice

- Run database backups at least daily; keep retention per compliance (e.g. 30 days minimum).
- Store backups off-host or in a different availability zone.
- Periodically test restore on a non-production copy.
- Align file backup frequency with how often new documents are uploaded; ensure `STORAGE_DIR` matches the path used by the API.

---

## 2. Row Level Security (RLS) on `audit_logs`

Migration `apps/api/database/migrations/017_rls_audit_logs.sql` enables RLS on `audit_logs`:

- **SELECT:** Rows are visible only when the session variable `app.current_tenant_id` is set to the tenant’s UUID. If it is not set or is empty, no rows are returned.
- **INSERT:** Allowed (append-only); the application always supplies `tenant_id` from validated context.
- **UPDATE/DELETE:** Already blocked by table triggers; no RLS policies added for them.

To use RLS for SELECT (e.g. in admin or reporting tools that use a single connection per request):

1. Before running any query that reads from `audit_logs`, set the tenant context for that connection:
   ```sql
   SET app.current_tenant_id = 'tenant-uuid-here';
   ```
2. Run your SELECTs; only that tenant’s audit rows will be visible.
3. To reset (e.g. for another tenant): `SET app.current_tenant_id = 'other-tenant-uuid';`

The API today enforces tenant isolation in application code (middleware + `tenant_id` on all queries). RLS adds a second layer of protection when connections use `app.current_tenant_id`.

---

## 3. System tenant (failed-login audit)

Failed login attempts are written to the audit log with a fixed **system tenant** ID so that every event has a valid `tenant_id` (required by the schema and hash chain).

- **System tenant UUID:** `00000000-0000-0000-0000-000000000001`
- **Requirement:** This UUID must exist in the `tenants` table. If it is missing, failed-login audit inserts will fail with a foreign key error.
- **Creating the system tenant:** Ensure your seed or bootstrap creates a row in `tenants` with `id = '00000000-0000-0000-0000-000000000001'` (and a name/code such as `SYSTEM`). Example:
  ```sql
  INSERT INTO tenants (id, name, tenant_code, status)
  VALUES ('00000000-0000-0000-0000-000000000001', 'System', 'SYSTEM', 'ACTIVE')
  ON CONFLICT (id) DO NOTHING;
  ```

---

## 4. Running migrations

- **Script:** `scripts/run-migrations.sh`
- Detects Docker vs local and runs SQL migrations from `apps/api/database/migrations/` in order (e.g. `001_*` through `017_*`).
- Run after deploying a new version that adds migrations; ensure the database is available and credentials are set (e.g. via `.env` or `POSTGRES_*`).

---

**Document version:** 1.0  
**Last updated:** 2025
