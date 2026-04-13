-- Migration 041: Add EM_NEGOCIACAO and ENCERRADO to real_estate_assets current_state check constraint
-- Spec Divergence #4: Asset state machine must include EM_NEGOCIACAO and ENCERRADO states

ALTER TABLE real_estate_assets DROP CONSTRAINT IF EXISTS real_estate_assets_status_check;
ALTER TABLE real_estate_assets DROP CONSTRAINT IF EXISTS real_estate_assets_current_state_check;

-- Re-add constraint with new states on the correct column (current_state)
ALTER TABLE real_estate_assets ADD CONSTRAINT real_estate_assets_current_state_check
  CHECK (current_state IN ('ACQUIRED','REGULARIZATION','RENOVATION','READY','EM_NEGOCIACAO','SOLD','RENTED','ENCERRADO'));
