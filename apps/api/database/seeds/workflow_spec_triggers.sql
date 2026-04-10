-- ============================================
-- SEED: Workflow Triggers — Especificação GEMS
-- Tenant: Grupo Racional (6a143fda-0f64-4fa3-a78b-e5bd8b4a5930)
--
-- Trigger 1: Arrematação Homologada (F4) → Criar ativo imobiliário EM_REGULARIZACAO
-- Trigger 2: Passivo > R$10.000 → Notificar Owner e bloquear mudança de status
-- Trigger 3: QG4 Score < 0.90 → Alertar Advogado Sênior
--
-- Bug fix v23:
--   Trigger 1: event_type corrigido para 'auction.bid.homologated'
--             (auctions.ts:243 emite este evento com payload { stage: "F4" })
--             condition corrigida para { stage: { eq: "F4" } }
--   Trigger 3: event_type corrigido para 'legal_case.qg4.scored'
--             (legal-cases.ts:422 emite este evento com payload { score: 0..1 })
--             condition corrigida para { score: { lt: 0.90 } } — gate_number removido
-- ============================================

-- Remover triggers antigos com nomes incorretos para re-inserir com event_type correto
DELETE FROM workflow_triggers
WHERE tenant_id = '6a143fda-0f64-4fa3-a78b-e5bd8b4a5930'
  AND name IN (
    'Arrematação Homologada → Criar Imóvel em Regularização',
    'QG4 Score Baixo → Alertar Advogado Sênior'
  );

-- Trigger 1: Arrematação Homologada → Criar real_estate_asset com status EM_REGULARIZACAO
-- Evento correto: auction.bid.homologated (emitido em auctions.ts:243)
-- Condição correta: stage = "F4" (payload do evento)
INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '6a143fda-0f64-4fa3-a78b-e5bd8b4a5930',
  'Arrematação Homologada → Criar Imóvel em Regularização',
  'auction.bid.homologated',
  '{"stage": {"eq": "F4"}}',
  'create_entity',
  '{"entity_type": "real_estate_asset", "status": "EM_REGULARIZACAO", "copy_fields": ["title", "address", "description", "estimated_value"], "reason": "Arrematação homologada (F4) — ativo imobiliário criado automaticamente para regularização."}',
  true,
  NOW(),
  NOW()
);

-- Trigger 2: Passivo > R$10.000 → Notificar Owner e bloquear mudança de status
INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '6a143fda-0f64-4fa3-a78b-e5bd8b4a5930',
  'Passivo > R$10.000 → Notificar Owner e Bloquear',
  'real_estate.liability_total_changed',
  '{"total_liabilities": {"gt": 10000}}',
  'block_and_notify',
  '{"block_status_change": true, "reason": "Total de passivos excede R$ 10.000. Mudança de status bloqueada até resolução.", "notification": {"target_role": "OWNER", "message": "ALERTA: Passivo do imóvel ultrapassou R$ 10.000. Mudança de status bloqueada automaticamente."}}',
  true,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- Trigger 3: QG4 Score < 0.90 → Alertar Advogado Sênior
-- Evento correto: legal_case.qg4.scored (emitido em legal-cases.ts:422)
-- Condição correta: score < 0.90 — gate_number removido (não está no payload)
INSERT INTO workflow_triggers (id, tenant_id, name, event_type, condition, action_type, action_config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '6a143fda-0f64-4fa3-a78b-e5bd8b4a5930',
  'QG4 Score Baixo → Alertar Advogado Sênior',
  'legal_case.qg4.scored',
  '{"score": {"lt": 0.90}}',
  'send_notification',
  '{"target_role": "ADVOGADO_SENIOR", "message": "ALERTA: Quality Gate 4 com score abaixo de 0.90. Revisão jurídica obrigatória antes de prosseguir.", "priority": "HIGH"}',
  true,
  NOW(),
  NOW()
);
