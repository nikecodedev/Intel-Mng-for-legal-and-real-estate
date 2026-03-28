-- ============================================
-- Migration 021: Default workflow triggers for cross-module orchestration
-- Seeds the system tenant with deterministic automation rules
-- ============================================

-- Trigger 1: ITBI payment marked as paid → create task for Despachante to register property
INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'ITBI Payment → Asset Regularization',
  'finance.transaction.paid',
  '{"transaction_category": {"eq": "ITBI"}}',
  'create_task',
  '{"title": "Registrar imóvel - Despachante", "description": "ITBI pago. Iniciar processo de registro do imóvel.", "assigned_role": "OPERATIONAL", "priority": "HIGH", "due_days": 5}',
  true,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- Trigger 2: Document processed with CPO status VERDE → notify owner
INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'Document VERDE → Notify Owner',
  'document.processed',
  '{"status_cpo": {"eq": "VERDE"}}',
  'send_notification',
  '{"message": "Documento aprovado (VERDE) - pronto para uso.", "target_role": "OWNER"}',
  true,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- Trigger 3: High risk auction (score >= 70) → block stage advance until resolved
INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'High Risk → Block Stage Advance',
  'auction.stage_advance',
  '{"risk_score": {"gte": 70}}',
  'block_transition',
  '{"reason": "Risk score >= 70%. Resolve due diligence issues before advancing."}',
  true,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;
