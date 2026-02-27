-- ============================================
-- MIGRATION: 018_audit_logs_api_columns.sql
-- PURPOSE: Add columns required by API AuditService to audit_logs
-- Use when audit_logs was created from schema.sql (missing event_type, etc.)
-- Idempotent: ADD COLUMN IF NOT EXISTS
-- ============================================

-- Columns used by apps/api/src/services/audit.ts INSERT
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS event_type VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS event_category VARCHAR(50);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_role VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_identifier VARCHAR(500);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_id VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS session_id VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS success BOOLEAN;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS error_code VARCHAR(50);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS compliance_flags TEXT[];
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS retention_category VARCHAR(50);

-- Backfill: set defaults for NOT NULL if API expects them (trigger sets previous_hash/current_hash)
-- event_type/event_category: allow NULL for old rows; API always sends values for new rows
COMMENT ON COLUMN audit_logs.event_type IS 'Event type e.g. user.login (API audit)';
COMMENT ON COLUMN audit_logs.event_category IS 'Category e.g. authentication (API audit)';
