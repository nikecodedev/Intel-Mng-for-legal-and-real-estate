-- Migration 038: Add matricula_status to real_estate_assets
-- Spec 5.5: TRAVA DE VENDA LEGAL bloqueia se status = EM_REGULARIZACAO OU matrícula não limpa
-- Valid values: PENDENTE (default), EM_ANALISE, LIMPA, COM_ONUS

ALTER TABLE real_estate_assets
  ADD COLUMN IF NOT EXISTS matricula_status TEXT NOT NULL DEFAULT 'PENDENTE'
  CHECK (matricula_status IN ('PENDENTE', 'EM_ANALISE', 'LIMPA', 'COM_ONUS'));

COMMENT ON COLUMN real_estate_assets.matricula_status IS
  'Status da matrícula no cartório: PENDENTE | EM_ANALISE | LIMPA | COM_ONUS';

CREATE INDEX IF NOT EXISTS idx_real_estate_assets_matricula_status
  ON real_estate_assets(tenant_id, matricula_status);
