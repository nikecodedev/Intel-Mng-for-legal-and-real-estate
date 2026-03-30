-- ============================================
-- SEED: ITBI Workflow Triggers
-- Required for Módulo 8 — Automação ITBI
-- These triggers enable the automation chain:
--   ITBI paid → Asset state changes to REGULARIZATION → Task created for Despachante
-- ============================================

-- Trigger 1: ITBI Payment → Change asset state to REGULARIZATION
INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'ITBI Payment → Asset Em Registro',
  'finance.transaction.paid',
  '{"transaction_category": {"eq": "ITBI"}}',
  'update_state',
  '{"entity_type": "real_estate_asset", "new_state": "REGULARIZATION", "reason": "ITBI paid — automatic transition to regularization"}',
  true,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- Trigger 2: ITBI Payment → Create task for Despachante
INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'ITBI Payment → Tarefa Despachante',
  'finance.transaction.paid',
  '{"transaction_category": {"eq": "ITBI"}}',
  'create_task',
  '{"title": "Registrar imóvel — Despachante", "description": "ITBI pago. Iniciar processo de registro do imóvel no cartório.", "task_type": "registration", "assigned_role": "OPERATIONAL", "priority": "HIGH", "due_days": 5}',
  true,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- Trigger 3: Document processed VERDE → Notify owner
INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'Document VERDE → Notify Owner',
  'document.processed',
  '{"status_cpo": {"eq": "VERDE"}}',
  'send_notification',
  '{"message": "Documento aprovado (VERDE) — pronto para uso no pipeline jurídico.", "target_role": "OWNER"}',
  true,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- Trigger 4: High risk auction → Block stage advance
INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'High Risk → Block Stage Advance',
  'auction.stage_advance',
  '{"risk_score": {"gte": 70}}',
  'block_transition',
  '{"reason": "Risk score ≥ 70%. Resolve all due diligence issues before advancing."}',
  true,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;
