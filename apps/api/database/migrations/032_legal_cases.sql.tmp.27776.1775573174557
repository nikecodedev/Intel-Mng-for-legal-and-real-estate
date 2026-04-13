-- Migration 032: Legal Cases (Processos)
-- Entidade central do modulo juridico

CREATE TABLE IF NOT EXISTS legal_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  case_number VARCHAR(100) NOT NULL,
  title TEXT NOT NULL,
  client_name TEXT,
  status VARCHAR(50) DEFAULT 'ABERTO',
  qg4_score DECIMAL(5,2),
  assigned_lawyer_id UUID,
  deadline DATE,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_legal_cases_tenant ON legal_cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_legal_cases_status ON legal_cases(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_legal_cases_deadline ON legal_cases(tenant_id, deadline);
