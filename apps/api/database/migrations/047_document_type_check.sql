-- Migration 047: Add document_type CHECK constraint (Spec Parcial #5)

DO $$
DECLARE
  valid_types TEXT[] := ARRAY[
    'CONTRACT','INVOICE','LEGAL_BRIEF','TITLE_DEED','APPRAISAL','COURT_ORDER',
    'PETITION','CONTESTACAO','LAUDO_PERICIAL','MATRICULA','AGRAVO','MANDADO',
    'OFICIO','NOTIFICACAO','TERMO_ACORDO','DEFESA','RECURSO','OTHER'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'document_type'
  ) THEN
    RETURN;
  END IF;

  -- Normalize existing values to uppercase
  UPDATE documents SET document_type = UPPER(document_type) WHERE document_type IS NOT NULL;

  -- Map any unrecognized values to 'OTHER'
  UPDATE documents
  SET document_type = 'OTHER'
  WHERE document_type IS NOT NULL
    AND UPPER(document_type) != ALL(valid_types);

  -- Drop existing constraint if present
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_document_type_check'
      AND conrelid = 'documents'::regclass
  ) THEN
    ALTER TABLE documents DROP CONSTRAINT documents_document_type_check;
  END IF;

  -- Add constraint
  ALTER TABLE documents ADD CONSTRAINT documents_document_type_check
    CHECK (document_type IS NULL OR document_type = ANY(ARRAY[
      'CONTRACT','INVOICE','LEGAL_BRIEF','TITLE_DEED','APPRAISAL','COURT_ORDER',
      'PETITION','CONTESTACAO','LAUDO_PERICIAL','MATRICULA','AGRAVO','MANDADO',
      'OFICIO','NOTIFICACAO','TERMO_ACORDO','DEFESA','RECURSO','OTHER'
    ]));
END $$;
