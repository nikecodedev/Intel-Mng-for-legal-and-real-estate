-- Migration 022: Add review workflow fields to generated_documents
-- Supports PENDING -> IN_REVIEW -> APPROVED / REJECTED lifecycle

ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'PENDING' CHECK (review_status IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'));
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
