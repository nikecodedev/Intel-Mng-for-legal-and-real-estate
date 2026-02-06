-- ============================================
-- Migration 007: Event-driven workflow automation
-- Deterministic rules only; all actions audited
-- ============================================

-- Triggers: event_type + condition (JSONB) + action (type + config)
CREATE TABLE IF NOT EXISTS workflow_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    name VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    condition JSONB NOT NULL DEFAULT '{}'::jsonb,
    action_type VARCHAR(50) NOT NULL,
    action_config JSONB NOT NULL DEFAULT '{}'::jsonb,

    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT valid_action_type CHECK (action_type IN ('create_task', 'send_notification', 'block_transition'))
);

CREATE INDEX idx_workflow_triggers_tenant_id ON workflow_triggers(tenant_id);
CREATE INDEX idx_workflow_triggers_event_type ON workflow_triggers(tenant_id, event_type) WHERE is_active = true;

COMMENT ON TABLE workflow_triggers IS 'Event-driven automation: event_type + deterministic condition + action (create_task, send_notification, block_transition)';

-- Tasks created by workflow (create_task action)
CREATE TABLE IF NOT EXISTS workflow_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    task_type VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',

    related_entity_type VARCHAR(100),
    related_entity_id UUID,

    trigger_id UUID REFERENCES workflow_triggers(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT valid_task_status CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'))
);

CREATE INDEX idx_workflow_tasks_tenant_id ON workflow_tasks(tenant_id);
CREATE INDEX idx_workflow_tasks_trigger_id ON workflow_tasks(trigger_id);
CREATE INDEX idx_workflow_tasks_related ON workflow_tasks(tenant_id, related_entity_type, related_entity_id);

-- Notifications created by workflow (send_notification action)
CREATE TABLE IF NOT EXISTS workflow_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    channel VARCHAR(50) NOT NULL DEFAULT 'alert',
    message TEXT NOT NULL,
    recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    trigger_id UUID REFERENCES workflow_triggers(id) ON DELETE SET NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_workflow_notifications_tenant_id ON workflow_notifications(tenant_id);
CREATE INDEX idx_workflow_notifications_recipient ON workflow_notifications(recipient_user_id) WHERE read_at IS NULL;

COMMENT ON TABLE workflow_tasks IS 'Tasks created by workflow create_task action';
COMMENT ON TABLE workflow_notifications IS 'Notifications created by workflow send_notification action';
