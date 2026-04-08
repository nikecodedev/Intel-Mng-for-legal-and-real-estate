-- Migration 035: Add legal_case_id to document_facts
-- Links document facts to legal cases for FPDN queries

ALTER TABLE document_facts ADD COLUMN IF NOT EXISTS legal_case_id UUID;
CREATE INDEX IF NOT EXISTS idx_document_facts_legal_case ON document_facts(tenant_id, legal_case_id);
