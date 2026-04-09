-- Migration 037: 4 concrete cross-module workflow triggers from spec
-- Seeds for Grupo Racional tenant (6a143fda-0f64-4fa3-a78b-e5bd8b4a5930)
-- and system tenant (00000000-0000-0000-0000-000000000001)

DO $$
DECLARE
  v_system_tenant UUID := '00000000-0000-0000-0000-000000000001';
  v_gr_tenant UUID := '6a143fda-0f64-4fa3-a78b-e5bd8b4a5930';
BEGIN

-- ── Trigger 1: ITBI Pago → Protocolar no Jurídico (SLA 24h) ────────────────
INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(), v_system_tenant,
  'ITBI Pago → Protocolo Jurídico SLA 24h',
  'finance.transaction.paid',
  '{"transaction_category": {"eq": "ITBI"}}',
  'create_task',
  '{"title": "Protocolar ITBI no Cartório", "description": "ITBI confirmado pago. Protocolar registro de transferência no cartório em até 24h.", "assigned_role": "ADVOGADO", "priority": "URGENT", "due_hours": 24}',
  true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(), v_gr_tenant,
  'ITBI Pago → Protocolo Jurídico SLA 24h',
  'finance.transaction.paid',
  '{"transaction_category": {"eq": "ITBI"}}',
  'create_task',
  '{"title": "Protocolar ITBI no Cartório", "description": "ITBI confirmado pago. Protocolar registro de transferência no cartório em até 24h.", "assigned_role": "ADVOGADO", "priority": "URGENT", "due_hours": 24}',
  true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- ── Trigger 2: Arrematação Homologada → Criar Ativo EM_REGULARIZACAO ────────
INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(), v_system_tenant,
  'Arrematação Homologada → Ativo EM_REGULARIZACAO',
  'auction.bid.homologated',
  '{"status": {"eq": "HOMOLOGATED"}}',
  'update_state',
  '{"target_entity": "real_estate_asset", "new_state": "EM_REGULARIZACAO", "create_if_missing": true, "description": "Ativo criado automaticamente após homologação do leilão. Estado inicial: EM_REGULARIZACAO."}',
  true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(), v_gr_tenant,
  'Arrematação Homologada → Ativo EM_REGULARIZACAO',
  'auction.bid.homologated',
  '{"status": {"eq": "HOMOLOGATED"}}',
  'update_state',
  '{"target_entity": "real_estate_asset", "new_state": "EM_REGULARIZACAO", "create_if_missing": true, "description": "Ativo criado automaticamente após homologação do leilão. Estado inicial: EM_REGULARIZACAO."}',
  true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- ── Trigger 3: Passivo > R$10.000 → Bloquear + Notificar Owner ─────────────
INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(), v_system_tenant,
  'Passivo > R$10k → Bloquear e Notificar Owner',
  'asset.liability.created',
  '{"amount_cents": {"gte": 1000000}}',
  'block_transition',
  '{"reason": "Passivo acima de R$10.000 registrado. Ativo bloqueado para operações até aprovação do Owner.", "notify_role": "OWNER", "notification_message": "Atenção: passivo crítico (> R$10.000) registrado no ativo. Revisão obrigatória antes de prosseguir."}',
  true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(), v_gr_tenant,
  'Passivo > R$10k → Bloquear e Notificar Owner',
  'asset.liability.created',
  '{"amount_cents": {"gte": 1000000}}',
  'block_transition',
  '{"reason": "Passivo acima de R$10.000 registrado. Ativo bloqueado para operações até aprovação do Owner.", "notify_role": "OWNER", "notification_message": "Atenção: passivo crítico (> R$10.000) registrado no ativo. Revisão obrigatória antes de prosseguir."}',
  true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- ── Trigger 4: QG4 Score < 0.90 → Escalar para Advogado Sênior ─────────────
INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(), v_system_tenant,
  'QG4 Score < 0.90 → Escalar para Advogado Sênior',
  'legal_case.qg4.scored',
  '{"score": {"lt": 0.90}}',
  'create_task',
  '{"title": "Revisão Obrigatória QG4 < 0.90", "description": "Score QG4 abaixo do limiar de 0.90. Caso requer revisão por Advogado Sênior antes de avançar.", "assigned_role": "ADVOGADO_SENIOR", "priority": "HIGH", "due_days": 2}',
  true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(), v_gr_tenant,
  'QG4 Score < 0.90 → Escalar para Advogado Sênior',
  'legal_case.qg4.scored',
  '{"score": {"lt": 0.90}}',
  'create_task',
  '{"title": "Revisão Obrigatória QG4 < 0.90", "description": "Score QG4 abaixo do limiar de 0.90. Caso requer revisão por Advogado Sênior antes de avançar.", "assigned_role": "ADVOGADO_SENIOR", "priority": "HIGH", "due_days": 2}',
  true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

END $$;
