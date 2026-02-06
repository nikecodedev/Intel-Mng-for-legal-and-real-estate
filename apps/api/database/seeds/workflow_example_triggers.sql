-- ============================================
-- Example workflow triggers (event-driven automation)
-- Run after 007_workflow_triggers.sql. Replace :tenant_id with your tenant UUID.
-- ============================================

-- 1) If ITBI marked paid → create legal task
-- Event: itbi.paid. Payload: { "itbi_paid": true, "related_entity_type": "auction_asset", "related_entity_id": "..." }
INSERT INTO workflow_triggers (tenant_id, name, event_type, condition, action_type, action_config)
SELECT id, 'ITBI paid → create legal task', 'itbi.paid',
  '{"op": "eq", "field": "itbi_paid", "value": true}'::jsonb,
  'create_task',
  '{"task_type": "legal", "title": "Follow-up: ITBI paid", "description": "ITBI marked paid; complete legal follow-up."}'::jsonb
FROM tenants LIMIT 1;

-- 2) If court deadline < 3 days → alert
-- Event: court_deadline.approaching. Payload: { "court_deadline": "2026-02-10" } (ISO date)
INSERT INTO workflow_triggers (tenant_id, name, event_type, condition, action_type, action_config)
SELECT id, 'Court deadline in 3 days → alert', 'court_deadline.approaching',
  '{"op": "days_until_lte", "field": "court_deadline", "value": 3}'::jsonb,
  'send_notification',
  '{"message": "Court deadline in 3 days or less.", "channel": "alert"}'::jsonb
FROM tenants LIMIT 1;

-- 3) If admin approval missing → block action
-- Event: admin_approval.required. Payload must NOT have admin_approval_received set (or false).
INSERT INTO workflow_triggers (tenant_id, name, event_type, condition, action_type, action_config)
SELECT id, 'Block if admin approval missing', 'admin_approval.required',
  '{"op": "not_present", "field": "admin_approval_received"}'::jsonb,
  'block_transition',
  '{"message": "Admin approval required before proceeding."}'::jsonb
FROM tenants LIMIT 1;
