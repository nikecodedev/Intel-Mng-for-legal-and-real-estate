-- Migration 051: quality_gate_results table
-- Used by legal-cases.ts QG4 scoring to persist gate evaluation history.

CREATE TABLE IF NOT EXISTS quality_gate_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id       UUID NOT NULL,
  entity_type     VARCHAR(50) NOT NULL DEFAULT 'legal_case',
  gate_type       VARCHAR(20) NOT NULL DEFAULT 'QG4',
  score           NUMERIC(5,2) NOT NULL DEFAULT 0,
  max_score       NUMERIC(5,2) NOT NULL DEFAULT 100,
  passed          BOOLEAN NOT NULL DEFAULT false,
  details         JSONB,
  evaluated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_qgr_tenant_entity  ON quality_gate_results(tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_qgr_gate_type      ON quality_gate_results(gate_type);
CREATE INDEX IF NOT EXISTS idx_qgr_passed         ON quality_gate_results(passed);

COMMENT ON TABLE quality_gate_results IS 'Persists QG evaluation history per entity (legal cases, documents, assets)';
