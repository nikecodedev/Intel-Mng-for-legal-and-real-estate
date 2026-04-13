-- Migration 047: Add document_type CHECK constraint (Spec Parcial #5)

DO $$
BEGIN
  -- Add document_type constraint if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'documents' AND constraint_name = 'documents_document_type_check'
  ) THEN
    ALTER TABLE documents ADD CONSTRAINT documents_document_type_check
      CHECK (document_type IN (
        'CONTRACT','INVOICE','LEGAL_BRIEF','TITLE_DEED','APPRAISAL','COURT_ORDER',
        'PETITION','CONTESTACAO','LAUDO_PERICIAL','MATRICULA','AGRAVO','MANDADO',
        'OFICIO','NOTIFICACAO','TERMO_ACORDO','DEFESA','RECURSO','OTHER'
      ));
  END IF;
END $$;
