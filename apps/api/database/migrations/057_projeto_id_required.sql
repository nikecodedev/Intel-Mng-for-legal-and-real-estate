-- Migration 057: Enforce projeto_id (process_id OR real_estate_asset_id) NOT NULL (Spec §6.2 / Divergência #8)
-- The existing no_orphan_transaction allows client_id alone.
-- Spec §6.2 requires all transactions to be linked to a projeto (process_id or real_estate_asset_id).
-- This migration tightens the constraint.

-- 1. Tighten no_orphan_transaction: process_id OR real_estate_asset_id required (client_id alone no longer sufficient)
ALTER TABLE financial_transactions
  DROP CONSTRAINT IF EXISTS no_orphan_transaction;

ALTER TABLE financial_transactions
  ADD CONSTRAINT no_orphan_transaction CHECK (
    (process_id IS NOT NULL) OR (real_estate_asset_id IS NOT NULL)
  );

COMMENT ON CONSTRAINT no_orphan_transaction ON financial_transactions
  IS 'Spec §6.2 Proibição de Orfandade: every transaction must link to process_id OR real_estate_asset_id (client_id alone is insufficient)';

-- 2. Same rule for expense_capture
ALTER TABLE expense_capture
  DROP CONSTRAINT IF EXISTS no_orphan_expense;

ALTER TABLE expense_capture
  ADD CONSTRAINT no_orphan_expense CHECK (
    (process_id IS NOT NULL) OR (real_estate_asset_id IS NOT NULL)
  );
