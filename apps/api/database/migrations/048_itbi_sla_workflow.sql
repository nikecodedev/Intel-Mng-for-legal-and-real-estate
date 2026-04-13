-- Migration 048: ITBI workflow trigger with SLA 24h (Spec Parcial #14)
-- Uses system tenant UUID (tenant_id NOT NULL constraint)

DO $$
DECLARE
  system_tenant UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Notification trigger
  IF NOT EXISTS (
    SELECT 1 FROM workflow_triggers WHERE event_type = 'itbi.paid' AND name = 'ITBI Pago — Notificação SLA 24h'
  ) THEN
    INSERT INTO workflow_triggers (tenant_id, name, event_type, condition, action_type, action_config, is_active)
    VALUES (
      system_tenant,
      'ITBI Pago — Notificação SLA 24h',
      'itbi.paid',
      '{}',
      'send_notification',
      '{"message": "ITBI pago. Prazo de registro no cartório: 24 horas.", "channel": "in_app", "sla_hours": 24}'::jsonb,
      TRUE
    );
  END IF;

  -- Task creation trigger
  IF NOT EXISTS (
    SELECT 1 FROM workflow_triggers WHERE event_type = 'itbi.paid' AND name = 'ITBI Pago — Criar Tarefa Registro 24h'
  ) THEN
    INSERT INTO workflow_triggers (tenant_id, name, event_type, condition, action_type, action_config, is_active)
    VALUES (
      system_tenant,
      'ITBI Pago — Criar Tarefa Registro 24h',
      'itbi.paid',
      '{}',
      'create_task',
      '{"title": "Registrar ITBI pago no cartório", "due_hours": 24, "priority": "HIGH", "assigned_role": "GESTOR_IMOBILIARIO"}'::jsonb,
      TRUE
    );
  END IF;
END $$;
