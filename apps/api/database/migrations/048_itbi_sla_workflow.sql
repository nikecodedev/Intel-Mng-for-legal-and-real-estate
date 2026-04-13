-- Migration 048: ITBI workflow trigger with SLA 24h (Spec Parcial #14)
-- workflow_triggers schema: id, tenant_id, name, event_type, condition, action_type, action_config, is_active

INSERT INTO workflow_triggers (tenant_id, name, event_type, condition, action_type, action_config, is_active)
VALUES
  (
    NULL,
    'ITBI Pago — Notificação SLA 24h',
    'itbi.paid',
    '{}',
    'send_notification',
    '{"message": "ITBI pago. Prazo de registro no cartório: 24 horas.", "channel": "in_app", "sla_hours": 24}'::jsonb,
    TRUE
  ),
  (
    NULL,
    'ITBI Pago — Criar Tarefa Registro 24h',
    'itbi.paid',
    '{}',
    'create_task',
    '{"title": "Registrar ITBI pago no cartório", "due_hours": 24, "priority": "HIGH", "assigned_role": "GESTOR_IMOBILIARIO"}'::jsonb,
    TRUE
  )
ON CONFLICT DO NOTHING;
