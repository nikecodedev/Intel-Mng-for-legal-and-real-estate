-- Migration 046: Rename real_estate_assets states from EN to PT-BR (Spec Parcial #7)
-- REGULARIZATION→REGULARIZACAO, RENOVATION→REFORMA, READY→PRONTO, SOLD→VENDIDO, RENTED→ALUGADO, ACQUIRED→ADQUIRIDO

-- Drop ALL existing check constraints on current_state (may be named differently)
ALTER TABLE real_estate_assets DROP CONSTRAINT IF EXISTS valid_asset_state;
ALTER TABLE real_estate_assets DROP CONSTRAINT IF EXISTS real_estate_assets_status_check;
ALTER TABLE real_estate_assets DROP CONSTRAINT IF EXISTS real_estate_assets_current_state_check;

-- Update existing data (EN→PT)
UPDATE real_estate_assets SET current_state = 'ADQUIRIDO'     WHERE current_state = 'ACQUIRED';
UPDATE real_estate_assets SET current_state = 'REGULARIZACAO' WHERE current_state = 'REGULARIZATION';
UPDATE real_estate_assets SET current_state = 'REFORMA'       WHERE current_state = 'RENOVATION';
UPDATE real_estate_assets SET current_state = 'PRONTO'        WHERE current_state = 'READY';
UPDATE real_estate_assets SET current_state = 'VENDIDO'       WHERE current_state = 'SOLD';
UPDATE real_estate_assets SET current_state = 'ALUGADO'       WHERE current_state = 'RENTED';

-- Update asset_state_transitions history if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'asset_state_transitions') THEN
    UPDATE asset_state_transitions SET from_state = 'ADQUIRIDO'     WHERE from_state = 'ACQUIRED';
    UPDATE asset_state_transitions SET from_state = 'REGULARIZACAO' WHERE from_state = 'REGULARIZATION';
    UPDATE asset_state_transitions SET from_state = 'REFORMA'       WHERE from_state = 'RENOVATION';
    UPDATE asset_state_transitions SET from_state = 'PRONTO'        WHERE from_state = 'READY';
    UPDATE asset_state_transitions SET from_state = 'VENDIDO'       WHERE from_state = 'SOLD';
    UPDATE asset_state_transitions SET from_state = 'ALUGADO'       WHERE from_state = 'RENTED';
    UPDATE asset_state_transitions SET to_state   = 'ADQUIRIDO'     WHERE to_state   = 'ACQUIRED';
    UPDATE asset_state_transitions SET to_state   = 'REGULARIZACAO' WHERE to_state   = 'REGULARIZATION';
    UPDATE asset_state_transitions SET to_state   = 'REFORMA'       WHERE to_state   = 'RENOVATION';
    UPDATE asset_state_transitions SET to_state   = 'PRONTO'        WHERE to_state   = 'READY';
    UPDATE asset_state_transitions SET to_state   = 'VENDIDO'       WHERE to_state   = 'SOLD';
    UPDATE asset_state_transitions SET to_state   = 'ALUGADO'       WHERE to_state   = 'RENTED';
  END IF;
END $$;

-- Re-add constraint with PT-BR names + EM_NEGOCIACAO + ENCERRADO
ALTER TABLE real_estate_assets ADD CONSTRAINT real_estate_assets_current_state_check
  CHECK (current_state IN ('ADQUIRIDO','REGULARIZACAO','REFORMA','PRONTO','EM_NEGOCIACAO','VENDIDO','ALUGADO','ENCERRADO'));
