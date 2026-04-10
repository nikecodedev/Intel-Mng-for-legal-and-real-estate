-- Migration 037: Fix workflow trigger event_type mismatches (production DB fix)
-- Correcção dos bugs de workflow detectados na validação v23

-- Bug 1: Arrematação F4 — event_type e condition incorretos
-- auctions.ts:243 emite 'auction.bid.homologated' com payload { stage: "F4" }
-- DB name: 'Arrematação Homologada → Criar Ativo Imobiliário'
UPDATE workflow_triggers
SET
  event_type = 'auction.bid.homologated',
  condition  = '{"stage": {"eq": "F4"}}',
  updated_at = NOW()
WHERE name ILIKE '%Arremat%'
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
-- override_events already exists with schema:
-- id, tenant_id, user_id, user_email, override_type, target_entity, target_id, otp_verified, reason, ...
-- Add justification column if missing
ALTER TABLE override_events ADD COLUMN IF NOT EXISTS justification TEXT;
ALTER TABLE override_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_override_events_tenant ON override_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_override_events_target ON override_events(target_entity, target_id);
