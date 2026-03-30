-- ============================================
-- Migration 031: Proactive Hash Violation Detection
-- Detects chain breaks at INSERT time, not just via /verify endpoint
-- ============================================

-- Function: After inserting a new audit log, verify the hash chain
-- If the new record's previous_hash doesn't match the last record's current_hash,
-- insert a violation alert into a dedicated table
CREATE TABLE IF NOT EXISTS compliance_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  violation_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'CRITICAL',
  details JSONB,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_compliance_violations_tenant ON compliance_violations(tenant_id, detected_at DESC);
ALTER TABLE compliance_violations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compliance_violations_tenant_sel ON compliance_violations;
CREATE POLICY compliance_violations_tenant_sel ON compliance_violations FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS compliance_violations_tenant_ins ON compliance_violations;
CREATE POLICY compliance_violations_tenant_ins ON compliance_violations FOR INSERT WITH CHECK (true);

-- Trigger function: runs AFTER INSERT on audit_logs
-- Compares the newly inserted record's previous_hash with the actual last hash
CREATE OR REPLACE FUNCTION detect_hash_chain_violation() RETURNS TRIGGER AS $$
DECLARE
  expected_prev TEXT;
BEGIN
  -- Get the current_hash of the record BEFORE the new one (second-to-last)
  SELECT current_hash INTO expected_prev
  FROM audit_logs
  WHERE tenant_id = NEW.tenant_id
    AND id != NEW.id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  -- If there was a previous record and hashes don't match, it's a violation
  IF expected_prev IS NOT NULL AND NEW.previous_hash != expected_prev THEN
    INSERT INTO compliance_violations (tenant_id, violation_type, severity, details)
    VALUES (
      NEW.tenant_id,
      'hash_chain_break',
      'CRITICAL',
      jsonb_build_object(
        'audit_log_id', NEW.id,
        'expected_previous_hash', left(expected_prev, 16) || '...',
        'actual_previous_hash', left(NEW.previous_hash, 16) || '...',
        'event_type', NEW.event_type,
        'detected_at', CURRENT_TIMESTAMP
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_detect_hash_violation ON audit_logs;
CREATE TRIGGER trg_detect_hash_violation
  AFTER INSERT ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION detect_hash_chain_violation();
