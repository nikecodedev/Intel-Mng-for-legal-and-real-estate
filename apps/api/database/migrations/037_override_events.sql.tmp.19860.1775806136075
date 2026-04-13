-- Migration 037: Fix workflow trigger event_type mismatches (production DB fix)
-- Correcção dos bugs de workflow detectados na validação v23

-- Bug 1: Arrematação F4 — event_type e condition incorretos
-- auctions.ts:243 emite 'auction.bid.homologated' com payload { stage: "F4" }
UPDATE workflow_triggers
SET
  event_type = 'auction.bid.homologated',
  condition  = '{"stage": {"eq": "F4"}}',
  updated_at = NOW()
WHERE name = 'Arrematação Homologada → Criar Imóvel em Regularização'
  AND event_type = 'auction.stage_advance';

-- Bug 2: QG4 Score — event_type e condition incorretos
-- legal-cases.ts:422 emite 'legal_case.qg4.scored' com payload { score: 0..1 }
UPDATE workflow_triggers
SET
  event_type = 'legal_case.qg4.scored',
  condition  = '{"score": {"lt": 0.90}}',
  updated_at = NOW()
WHERE name = 'QG4 Score Baixo → Alertar Advogado Sênior'
  AND event_type = 'quality_gate.evaluated';

-- Create override_events table if it doesn't exist
-- (supports QG4 override audit trail per spec)
CREATE TABLE IF NOT EXISTS override_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  user_id       UUID NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     UUID,
  event_type    TEXT NOT NULL,
  justification TEXT NOT NULL,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_override_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_override_events_tenant ON override_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_override_events_entity ON override_events(entity_type, entity_id);
