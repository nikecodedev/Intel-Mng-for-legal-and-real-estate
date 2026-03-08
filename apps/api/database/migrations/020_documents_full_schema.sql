-- Migration: 020_documents_full_schema.sql
-- PURPOSE: Add all missing columns to the documents table to match the application model.
-- The original migration (001) only created a minimal table with 8 columns.
-- This adds the ~30 columns the Document model expects.

-- Document identification
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_number VARCHAR(100);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS title VARCHAR(500);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_type VARCHAR(100);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- File information
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_name VARCHAR(500);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);

-- Make file_hash_sha256 and storage_path nullable (not always available at creation)
ALTER TABLE documents ALTER COLUMN file_hash_sha256 DROP NOT NULL;
ALTER TABLE documents ALTER COLUMN storage_path DROP NOT NULL;
ALTER TABLE documents ALTER COLUMN ocr_confidence DROP NOT NULL;
ALTER TABLE documents ALTER COLUMN dpi_resolution DROP NOT NULL;

-- Set defaults for existing NOT NULL columns
ALTER TABLE documents ALTER COLUMN ocr_confidence SET DEFAULT 0;
ALTER TABLE documents ALTER COLUMN dpi_resolution SET DEFAULT 0;

-- OCR fields
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ocr_processed BOOLEAN DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ocr_text TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ocr_processed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ocr_engine VARCHAR(50);

-- DPI fields
ALTER TABLE documents ADD COLUMN IF NOT EXISTS dpi_processed BOOLEAN DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS dpi_processed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS image_quality_score FLOAT;

-- Status fields
ALTER TABLE documents ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'DRAFT';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN DEFAULT true;

-- CPO (Quality Control)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS cpo_reviewer_id UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS cpo_reviewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS cpo_notes TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS cpo_checklist JSONB DEFAULT '{}';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS cpo_approval_required BOOLEAN DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS cpo_approved_by UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS cpo_approved_at TIMESTAMP WITH TIME ZONE;

-- Ownership
ALTER TABLE documents ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- Relationships
ALTER TABLE documents ADD COLUMN IF NOT EXISTS parent_document_id UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS related_document_ids UUID[];
ALTER TABLE documents ADD COLUMN IF NOT EXISTS process_id UUID;

-- Dates
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_date DATE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS expiration_date DATE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS effective_date DATE;

-- Metadata
ALTER TABLE documents ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE documents ADD COLUMN IF NOT EXISTS keywords TEXT[];

-- Compliance
ALTER TABLE documents ADD COLUMN IF NOT EXISTS confidentiality_level VARCHAR(20) DEFAULT 'INTERNAL';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS retention_policy VARCHAR(100);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS retention_until DATE;

-- Timestamps (add missing ones)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Generate document_number for any existing rows that don't have one
UPDATE documents SET document_number = 'DOC-' || SUBSTRING(id::text, 1, 8) WHERE document_number IS NULL;

-- Add unique index on document_number per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_tenant_docnum ON documents(tenant_id, document_number);

-- Add index for status queries
CREATE INDEX IF NOT EXISTS idx_documents_tenant_status_full ON documents(tenant_id, status) WHERE deleted_at IS NULL;

-- Add index for file hash lookups
CREATE INDEX IF NOT EXISTS idx_documents_tenant_hash ON documents(tenant_id, file_hash_sha256) WHERE file_hash_sha256 IS NOT NULL;

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS set_documents_updated_at ON documents;
CREATE TRIGGER set_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
