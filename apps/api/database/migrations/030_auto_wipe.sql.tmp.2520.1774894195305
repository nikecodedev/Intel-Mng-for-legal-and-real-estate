-- Auto-wipe: mark expense receipts for deletion after TTL
ALTER TABLE documents ADD COLUMN IF NOT EXISTS auto_wipe_at TIMESTAMPTZ;

-- Function to schedule wipe on expense-linked documents
CREATE OR REPLACE FUNCTION schedule_expense_auto_wipe() RETURNS TRIGGER AS $$
BEGIN
  -- When an expense is created with a receipt, schedule the file for deletion in 24h
  IF NEW.receipt_document_id IS NOT NULL THEN
    UPDATE documents
    SET auto_wipe_at = CURRENT_TIMESTAMP + INTERVAL '24 hours'
    WHERE id = NEW.receipt_document_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if expense_capture table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'expense_capture') THEN
    DROP TRIGGER IF EXISTS trg_expense_auto_wipe ON expense_capture;
    CREATE TRIGGER trg_expense_auto_wipe
      AFTER INSERT ON expense_capture
      FOR EACH ROW EXECUTE FUNCTION schedule_expense_auto_wipe();
  END IF;
END $$;

-- Index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_documents_auto_wipe ON documents(auto_wipe_at) WHERE auto_wipe_at IS NOT NULL;

-- Function to execute the wipe (called periodically from app layer)
CREATE OR REPLACE FUNCTION execute_auto_wipe() RETURNS INTEGER AS $$
DECLARE
  wiped_count INTEGER;
BEGIN
  -- Null out file content and mark as wiped for documents past their TTL
  WITH wiped AS (
    UPDATE documents
    SET file_path = NULL,
        file_size = 0,
        auto_wipe_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE auto_wipe_at IS NOT NULL
      AND auto_wipe_at <= CURRENT_TIMESTAMP
    RETURNING id
  )
  SELECT COUNT(*) INTO wiped_count FROM wiped;

  RETURN wiped_count;
END;
$$ LANGUAGE plpgsql;
