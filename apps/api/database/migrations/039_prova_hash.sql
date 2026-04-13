-- Migration 039: Add prova_hash column to document_facts
-- Spec Omission #5: SHA-256 imutável para rastreabilidade de provas documentais

ALTER TABLE document_facts ADD COLUMN IF NOT EXISTS prova_hash TEXT DEFAULT NULL;
COMMENT ON COLUMN document_facts.prova_hash IS 'SHA-256 imutável: hash(fact_id+proof_doc_id+tenant_id+timestamp)';
