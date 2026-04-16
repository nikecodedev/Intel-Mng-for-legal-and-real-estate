-- Migration 056: QG4 Hard Gate on legal_case status transitions (Spec §5.2 / Divergência #5)
-- Adds a DB trigger that blocks advancing a legal case to terminal/advanced stages
-- unless qg4_score >= 90.

-- 1. Add status constraint to legal_cases
ALTER TABLE legal_cases
  DROP CONSTRAINT IF EXISTS valid_legal_case_status;

ALTER TABLE legal_cases
  ADD CONSTRAINT valid_legal_case_status CHECK (
    status IN ('ABERTO', 'EM_ANALISE', 'EM_JULGAMENTO', 'CONCLUIDO', 'ARQUIVADO', 'SUSPENSO', 'CANCELADO')
  );

-- 2. DB trigger function: block status advance unless QG4 >= 90
CREATE OR REPLACE FUNCTION fn_enforce_qg4_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  -- States that require QG4 >= 90 before entry
  v_blocked_states TEXT[] := ARRAY['EM_JULGAMENTO', 'CONCLUIDO'];
BEGIN
  -- Only fire on status change to a blocked state
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status = ANY(v_blocked_states)
  THEN
    IF NEW.qg4_score IS NULL OR NEW.qg4_score < 90 THEN
      RAISE EXCEPTION 'QG4_GATE: score QG4 insuficiente (% / 90 mínimo) — transição para status % bloqueada (Spec §5.2). Execute /qg4/calculate primeiro.',
        COALESCE(NEW.qg4_score::text, 'não calculado'), NEW.status
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qg4_hard_gate ON legal_cases;
CREATE TRIGGER trg_qg4_hard_gate
  BEFORE UPDATE ON legal_cases
  FOR EACH ROW
  EXECUTE FUNCTION fn_enforce_qg4_gate();

COMMENT ON FUNCTION fn_enforce_qg4_gate() IS 'Blocks legal_case status transition to EM_JULGAMENTO/CONCLUIDO unless qg4_score >= 90 (Spec §5.2)';
