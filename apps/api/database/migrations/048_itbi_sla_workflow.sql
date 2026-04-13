-- Migration 048: ITBI workflow trigger with SLA 24h (Spec Parcial #14)

INSERT INTO workflow_triggers (
  tenant_id,
  trigger_name,
  event_type,
  conditions,
  actions,
  is_active,
  description
)
SELECT
  NULL,  -- system-level trigger (applies to all tenants)
  'ITBI Paid — SLA 24h Notificação',
  'itbi.paid',
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'type', 'send_notification',
      'config', jsonb_build_object(
        'message', 'ITBI pago. Prazo de registro: 24 horas.',
        'channel', 'in_app',
        'sla_hours', 24,
        'escalate_after_hours', 24
      )
    ),
    jsonb_build_object(
      'type', 'create_task',
      'config', jsonb_build_object(
        'title', 'Registrar ITBI pago no cartório',
        'due_hours', 24,
        'priority', 'HIGH',
        'assigned_role', 'GESTOR_IMOBILIARIO'
      )
    )
  ),
  TRUE,
  'SLA 24h para registro de ITBI após pagamento confirmado (Spec §6 Parcial #14)'
WHERE NOT EXISTS (
  SELECT 1 FROM workflow_triggers WHERE event_type = 'itbi.paid' AND tenant_id IS NULL
);
