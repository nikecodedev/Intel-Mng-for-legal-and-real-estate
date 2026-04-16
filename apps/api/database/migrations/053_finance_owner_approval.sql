-- Migration 053: Finance Owner Approval Gate (Spec §6.4)
-- Adds PENDING_APPROVAL status and approval tracking columns to financial_transactions.
-- Transactions >= R$5.000 (500_000 cents) must wait for Owner approval before processing.

-- 1. Drop the existing constraint and recreate with PENDING_APPROVAL
ALTER TABLE financial_transactions
  DROP CONSTRAINT IF EXISTS valid_payment_status;

ALTER TABLE financial_transactions
  ADD CONSTRAINT valid_payment_status CHECK (
    payment_status IN ('PENDING', 'PAID', 'PARTIAL', 'CANCELLED', 'OVERDUE', 'PENDING_APPROVAL', 'REJECTED')
  );

-- 2. Add approval tracking columns
ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS requires_owner_approval BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 3. Index for pending approval queue
CREATE INDEX IF NOT EXISTS idx_fin_tx_pending_approval
  ON financial_transactions(tenant_id, payment_status)
  WHERE payment_status = 'PENDING_APPROVAL' AND deleted_at IS NULL;

COMMENT ON COLUMN financial_transactions.requires_owner_approval IS 'True when amount_cents >= 500000 (R$5.000) — requires Owner approval (Spec §6.4)';
COMMENT ON COLUMN financial_transactions.approved_by IS 'User ID of Owner who approved the transaction';
COMMENT ON COLUMN financial_transactions.approved_at IS 'Timestamp when Owner approved';
COMMENT ON COLUMN financial_transactions.rejection_reason IS 'Reason provided by Owner when rejecting a transaction';

-- 4. Permission for Owner approval gate
INSERT INTO permissions (name, resource, action, description)
VALUES ('finance:approve', 'finance', 'approve', 'Approve or reject high-value financial transactions (Spec §6.4)')
ON CONFLICT (name) DO NOTHING;

-- 5. Grant finance:approve only to OWNER role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'OWNER' AND p.name = 'finance:approve'
ON CONFLICT DO NOTHING;
