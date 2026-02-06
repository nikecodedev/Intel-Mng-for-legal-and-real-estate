# End-to-End Validation Scenarios

This document describes the six E2E scenarios, expected **validation logs** (audit events), and **tenant isolation** confirmation.

---

## Prerequisites

- API running with DB and migrations applied.
- Two tenants (e.g. `tenant_a`, `tenant_b`) and a user per tenant with JWT.
- Permissions: `documents:*`, `facts:*`, `auctions:*`, `workflow:*`, `intelligence:read`, etc.

---

## Scenario 1: Upload legal document → OCR → CPO → fact extraction

### Steps

1. **Upload document**  
   `POST /api/v1/documents/upload`  
   Body: `title`, `document_type`, `file_path` (or multipart file).  
   Header: `Authorization: Bearer <token_tenant_a>`.

2. **Processing** (async): OCR runs, CPO validation (VERDE/AMARELO/VERMELHO), then field extraction and **document_facts** population.

3. **Get document**  
   `GET /api/v1/documents/:id`  
   Expect: `status_cpo`, `ocr_processed`, extraction and quality flags.

4. **Get facts for document**  
   Query `document_facts` by `document_id` (via internal API or DB).  
   Expect: rows with `fact_type`, `fact_value`, `page_number`, `confidence_score`.

### Validation logs (audit)

| Event / Step              | audit_logs.event_type   | audit_logs.resource_type | audit_logs.tenant_id |
|---------------------------|-------------------------|---------------------------|------------------------|
| Document upload           | `data.create`           | `document`                | = tenant_a            |
| Document view/read        | `data.read`             | `document`                | = tenant_a            |

### Tenant isolation

- Use token for **tenant_b** and call `GET /api/v1/documents/:id` with a document **id that belongs to tenant_a**.  
- **Expected:** 404 (document not found).  
- **Confirmation:** All document and document_facts queries use `tenant_id` from `req.context.tenant_id` only.

---

## Scenario 2: Use facts to generate legal document

### Steps

1. **Get fact IDs** for an asset (from scenario 1 or list facts by document).

2. **Create generated document**  
   `POST /api/v1/generated-documents`  
   Body: `{ "content": "...", "source_fact_ids": ["uuid1", "uuid2"] }`  
   Header: `Authorization: Bearer <token_tenant_a>`.

3. **Blocked if:** any fact missing or any source document not CPO-approved (status_cpo = VERDE or cpo_approved_at set).  
   **Expected:** 400 with `code: 'MISSING_FACT'` or `'SOURCE_NOT_CPO_APPROVED'`.

4. **Success:** 201 and `generated_documents` row with `source_fact_ids` populated.

### Validation logs (audit)

| Event                     | audit_logs.event_type        | audit_logs.resource_type    | audit_logs.tenant_id |
|---------------------------|-------------------------------|------------------------------|------------------------|
| Generated doc created      | `generated_document.create`   | `generated_document`         | = tenant_a            |

### Tenant isolation

- Call with **tenant_b** token and `source_fact_ids` that belong to **tenant_a**.  
- **Expected:** 400 (facts not found or validation failure).  
- **Confirmation:** `validateFactsForGeneration` and `DocumentFactModel.findByIds` use `tenant_id`; facts from another tenant are not visible.

---

## Scenario 3: Trace a generated statement back to source PDF

### Steps

1. **Get source for a fact**  
   `GET /api/v1/facts/:factId/source`  
   Header: `Authorization: Bearer <token_tenant_a>`.

2. **Expected response:**  
   `fact` (id, fact_type, fact_value, page_number, bounding_box),  
   `source_document` (id, document_number, title, status_cpo).

3. **Secure view of source document**  
   `GET /api/v1/documents/:documentId/secure-view`  
   Returns metadata and viewable content (no download).  
   Or use viewer: `GET /documents/:id/view` (web) which uses `viewer-context` and `viewer-asset`.

### Validation logs (audit)

| Event           | audit_logs.event_type | audit_logs.resource_type | audit_logs.tenant_id |
|-----------------|-----------------------|---------------------------|------------------------|
| Fact jump-back  | `fact.jump_back`       | `document_fact`           | = tenant_a            |
| Document view   | `document.view`        | `document`                | = tenant_a            |

### Tenant isolation

- Call `GET /api/v1/facts/:factId/source` with **tenant_b** token and a **factId from tenant_a**.  
- **Expected:** 404 (Fact not found).  
- **Confirmation:** `DocumentFactModel.findById(factId, tenantId)` uses `req.context.tenant_id` only.

---

## Scenario 4: Create auction asset → run MPGA workflow

### Steps

1. **Create asset**  
   `POST /api/v1/auctions/assets`  
   Body: `{ "title": "Asset 1", "linked_document_ids": [] }`.  
   Expect: 201, `current_stage: "F0"`.

2. **Transition F0 → F1**  
   `POST /api/v1/auctions/assets/:id/transition`  
   Body: `{ "to_stage": "F1" }`.  
   Expect: 200, `previous_stage: "F0"`, `to_stage: "F1"`.

3. **Invalid: skip stage**  
   Same endpoint, body `{ "to_stage": "F3" }`.  
   Expect: 400, `code: 'INVALID_TRANSITION'`.

4. **Continue to F9**  
   Repeated transitions F1→F2→…→F9. Each step 200.

### Validation logs (audit)

| Event           | audit_logs.event_type            | audit_logs.details              | audit_logs.tenant_id |
|-----------------|-----------------------------------|----------------------------------|------------------------|
| Asset create    | `auction_asset.create`            | initial_stage: F0                | = tenant_a            |
| Each transition| `auction_asset.stage_transition`  | from_stage, to_stage             | = tenant_a            |

### Tenant isolation

- Create asset as **tenant_a**, then call `POST .../transition` with **tenant_b** token and same asset id.  
- **Expected:** 404 (Auction asset not found).  
- **Confirmation:** `AuctionAssetModel.transitionStage(id, tenantId, toStage)` uses `tenant_id`; asset from another tenant is not found.

---

## Scenario 5: Calculate ROI → block bid on high risk

### Steps

1. **Create auction asset** (as in scenario 4).

2. **Set ROI inputs**  
   `PUT /api/v1/auctions/assets/:id/roi`  
   Body: `{ "acquisition_price_cents": 10000000, "taxes_itbi_cents": 500000, "expected_resale_value_cents": 12000000 }`.  
   Expect: 200, `outputs.net_profit_cents`, `outputs.roi_percentage`, `version_number`.

3. **Set due diligence to risk** (so risk_score ≥ 70):  
   `PUT /api/v1/auctions/assets/:id/due-diligence`  
   Body: e.g. `{ "occupancy": { "status": "risk", "notes": null }, "debts": { "status": "risk", "notes": null }, "legal_risks": { "status": "risk", "notes": null }, "zoning": { "status": "risk", "notes": null } }`.  
   Expect: 200, `risk_level: "HIGH"`, `bidding_disabled: true`.

4. **Place bid**  
   `POST /api/v1/auctions/assets/:id/bids`  
   Body: `{ "amount_cents": 10000000 }`.  
   **Expected:** 403, message that bidding is disabled (risk block).  
   **Validation log:** `intelligence.refusal` with violation `VIOLATION_RISK_BLOCK_ACTIVE`.

5. **Lower risk** (e.g. set all to `ok`), then place bid again.  
   **Expected:** 201.

### Validation logs (audit)

| Event              | audit_logs.event_type   | audit_logs.details                    | audit_logs.tenant_id |
|--------------------|-------------------------|----------------------------------------|------------------------|
| ROI recalc         | `roi.recalculation`      | version_number, net_profit_cents       | = tenant_a            |
| Bid blocked        | `intelligence.refusal`  | violations: VIOLATION_RISK_BLOCK_ACTIVE| = tenant_a            |
| Bid created        | `auction_bid.create`    | amount_cents                           | = tenant_a            |

### Tenant isolation

- Create asset and set HIGH risk as **tenant_a**. With **tenant_b** token call `POST .../bids` with **tenant_a** asset id.  
- **Expected:** 404 (Auction asset not found).  
- **Confirmation:** Bids and intelligence validate use `req.context.tenant_id`; no cross-tenant access.

---

## Scenario 6: Trigger workflow automation

### Steps

1. **Create trigger (ITBI paid → create task)**  
   `POST /api/v1/workflow/triggers`  
   Body:  
   `{ "name": "ITBI paid task", "event_type": "itbi.paid", "condition": { "op": "eq", "field": "itbi_paid", "value": true }, "action_type": "create_task", "action_config": { "task_type": "legal", "title": "Follow-up: ITBI paid" } }`.  
   Expect: 201.

2. **Emit event**  
   `POST /api/v1/workflow/emit`  
   Body: `{ "event_type": "itbi.paid", "payload": { "itbi_paid": true, "related_entity_type": "auction_asset", "related_entity_id": "<asset_uuid>" } }`.  
   Expect: 200, `triggered` array with one entry (create_task).

3. **Verify**  
   Query `workflow_tasks` (or future GET endpoint) for new task with same tenant and trigger.

4. **Blocking trigger**  
   Create trigger with `event_type: "admin_approval.required"`, condition `{ "op": "not_present", "field": "admin_approval_received" }`, action `block_transition`.  
   Emit `{ "event_type": "admin_approval.required", "payload": {} }`.  
   **Expected:** 403, workflow gate blocked.

### Validation logs (audit)

| Event           | audit_logs.event_type       | audit_logs.resource_type  | audit_logs.tenant_id |
|-----------------|------------------------------|----------------------------|------------------------|
| Trigger create  | `workflow_trigger.create`    | `workflow_trigger`         | = tenant_a            |
| Action executed | `workflow.action_executed`   | `workflow_trigger`         | = tenant_a            |

### Tenant isolation

- Create trigger as **tenant_a**. With **tenant_b** token call `POST /api/v1/workflow/emit` with same `event_type` and payload.  
- **Expected:** Triggers for **tenant_b** are evaluated (tenant_b’s context); tenant_a’s triggers are not run.  
- **Confirmation:** `WorkflowTriggerModel.listByEventType(tenantId, eventType)` uses `tenant_id`; each tenant has isolated triggers.

---

## Summary: Validation logs to check

- **Document lifecycle:** `data.create`, `data.read`, `document.viewer_context`, `document.viewer_asset`, `document.view`.
- **Facts / traceability:** `fact.jump_back`, `document.view`.
- **Generated doc:** `generated_document.create`; refusals by service (no audit code but 400).
- **Auction:** `auction_asset.create`, `auction_asset.stage_transition`, `roi.recalculation`, `intelligence.refusal` (when bid blocked), `auction_bid.create`.
- **Workflow:** `workflow_trigger.create`, `workflow.action_executed`.
- **Intelligence:** `intelligence.suggestion`, `intelligence.refusal`.

All of the above must have **audit_logs.tenant_id** equal to the tenant of the request (from JWT / `req.context.tenant_id`). No audit log must ever be written with a tenant_id from a header or body; only from server-side context.

---

## Running the test cases

From the API app directory:

```bash
cd apps/api
npm install   # if not already
npm run test
```

This runs Vitest for `tests/e2e-scenarios.test.ts` and any other `*.test.ts` / `*.spec.ts` under `tests/` or `src/`. The tests cover:

- **Scenario 2:** Generated document validation error codes (MISSING_FACT, SOURCE_NOT_CPO_APPROVED).
- **Scenario 3:** Fact source response shape (fact + source_document).
- **Scenario 4:** MPGA stages and InvalidTransitionError.
- **Scenario 5:** ROI calculation and risk score (HIGH when ≥70).
- **Scenario 6:** Workflow condition evaluation (eq, not_present, days_until_lte).
- **Tenant isolation:** TenantRequiredError when tenant_id is missing.
- **Intelligence:** Deterministic rule codes and result shape.

Full E2E (HTTP against running API with real DB) is described in the scenario steps above; add Supertest + test DB for automated API E2E if needed.
