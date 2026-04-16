-- Migration 041: Add EM_NEGOCIACAO and ENCERRADO states (English names — superseded by 046 which renames to PT-BR)
-- Spec Divergence #4: Asset state machine must include EM_NEGOCIACAO and ENCERRADO states
-- Note: 046_asset_states_pt.sql drops this constraint and re-adds it with PT-BR names. Both migrations are required.

ALTER TABLE real_estate_assets DROP CONSTRAINT IF EXISTS real_estate_assets_status_check;
ALTER TABLE real_estate_assets DROP CONSTRAINT IF EXISTS real_estate_assets_current_state_check;

-- Re-add constraint with new states on the correct column (current_state)
ALTER TABLE real_estate_assets ADD CONSTRAINT real_estate_assets_current_state_check
  CHECK (current_state IN ('ACQUIRED','REGULARIZATION','RENOVATION','READY','EM_NEGOCIACAO','SOLD','RENTED','ENCERRADO'));
