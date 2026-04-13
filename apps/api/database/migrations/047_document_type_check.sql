-- Migration 047: Add document_type CHECK constraint (Spec Parcial #5)
-- Uses DO block to handle case where constraint already exists

DO $$
BEGIN
  -- Drop existing constraint if present
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_document_type_check'
      AND conrelid = 'documents'::regclass
  ) THEN
    ALTER TABLE documents DROP CONSTRAINT documents_document_type_check;
  END IF;

  -- Add constraint with all valid document types
  -- Only add if document_type column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'document_type'
  ) THEN
    -- Normalize existing values to uppercase first
    UPDATE documents SET document_type = UPPER(document_type) WHERE document_type IS NOT NULL;

    ALTER TABLE documents ADD CONSTRAINT documents_document_type_check
      CHECK (document_type IS NULL OR document_type IN (
        'CONTRACT','INVOICE','LEGAL_BRIEF','TITLE_DEED','APPRAISAL','COURT_ORDER',
        'PETITION','CONTESTACAO','LAUDO_PERICIAL','MATRICULA','AGRAVO','MANDADO',
        'OFICIO','NOTIFICACAO','TERMO_ACORDO','DEFESA','RECURSO','OTHER'
      ));
  END IF;
END $$;
