# Workflow Engine (Event-Driven Automation)

Deterministic rules only; no AI-generated actions. All actions are audited.

## Tables

- **workflow_triggers**: `event_type`, `condition` (JSONB), `action_type`, `action_config`
- **workflow_tasks**: Tasks created by `create_task` action
- **workflow_notifications**: Notifications created by `send_notification` action

## Action Types

| Action | Description |
|--------|-------------|
| `create_task` | Insert into workflow_tasks (task_type, title, description, related_entity) |
| `send_notification` | Insert into workflow_notifications (channel, message) |
| `block_transition` | Return `allowed: false` so caller can refuse the operation (e.g. 403) |

## Condition (Deterministic)

Evaluated against event `payload`. JSON: `{ "op", "field", "value?" }`.

| op | Meaning |
|----|---------|
| `eq` | payload[field] === value |
| `not_eq` | payload[field] !== value |
| `present` | payload[field] != null && !== '' |
| `not_present` | payload[field] == null or === '' |
| `days_until_lte` | Days from now to payload[field] (ISO date) ≤ value |
| `days_until_lt` | Days from now to payload[field] < value |

## Example Automations

1. **ITBI marked paid → create legal task**  
   Event: `itbi.paid`. Condition: `{ "op": "eq", "field": "itbi_paid", "value": true }`.  
   Action: `create_task` with `task_type: "legal"`, `title: "Follow-up: ITBI paid"`.

2. **Court deadline < 3 days → alert**  
   Event: `court_deadline.approaching`. Condition: `{ "op": "days_until_lte", "field": "court_deadline", "value": 3 }`.  
   Action: `send_notification` with `channel: "alert"`, message.

3. **Admin approval missing → block action**  
   Event: `admin_approval.required`. Condition: `{ "op": "not_present", "field": "admin_approval_received" }`.  
   Action: `block_transition` with `message: "Admin approval required before proceeding."`

## Emitting Events

- **HTTP**: `POST /workflow/emit` with `{ "event_type": "...", "payload": { ... } }`. If any trigger runs `block_transition`, response is 403.
- **In code**: `import { runWorkflow } from '../services/workflow-engine';` then `const result = await runWorkflow({ tenantId, eventType, payload, userId, request: req });` — if `!result.allowed`, abort the operation and return 403 with `result.blockMessage`.

## Permissions

- `workflow:read` – list/get triggers
- `workflow:update` – create/update triggers
- `workflow:emit` – POST /workflow/emit

Seed these permissions and assign to roles as needed.
