-- ============================================
-- Migration 003: Document Extractions & Quality Flags
-- Legal Engine Pipeline Support
-- ============================================

-- ============================================
-- DOCUMENT_EXTRACTIONS TABLE
-- Stores extracted structured data from documents
-- ============================================
CREATE TABLE IF NOT EXISTS document_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Multi-tenant isolation
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Document reference
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    
    -- Extracted legal fields
    process_number VARCHAR(100),              -- Número do processo (e.g., "0001234-56.2023.8.26.0100")
    court VARCHAR(500),                       -- Tribunal/Vara
    court_type VARCHAR(100),                  -- Tipo de tribunal (TJ, TRF, STJ, STF, etc.)
    court_state VARCHAR(2),                   -- UF do tribunal
    
    -- Parties involved
    parties JSONB DEFAULT '[]'::jsonb,        -- Array of {type, name, document, role}
    -- Structure: [{"type": "plaintiff"|"defendant"|"witness", "name": "...", "cpf_cnpj": "...", "role": "..."}]
    
    -- Monetary values
    monetary_values JSONB DEFAULT '[]'::jsonb, -- Array of {type, value, currency, description}
    -- Structure: [{"type": "causa"|"condenacao"|"honorarios", "value": 10000.00, "currency": "BRL", "description": "..."}]
    total_monetary_value DECIMAL(18, 2),       -- Sum of all monetary values
    
    -- Dates extracted
    extracted_dates JSONB DEFAULT '[]'::jsonb, -- Array of {type, date, description}
    -- Structure: [{"type": "distribuicao"|"sentenca"|"vencimento", "date": "2023-01-15", "description": "..."}]
    
    -- Full extracted text
    extracted_text TEXT,                       -- Full OCR text
    extracted_text_hash VARCHAR(64),          -- SHA-256 of extracted text for deduplication
    
    -- Extraction metadata
    extraction_engine VARCHAR(100) DEFAULT 'tesseract', -- OCR engine used
    extraction_version VARCHAR(50),            -- Version of extraction logic
    extraction_language VARCHAR(10) DEFAULT 'por', -- Language used for extraction
    
    -- Confidence scores
    overall_confidence DECIMAL(5, 2),          -- Overall extraction confidence (0-100)
    field_confidences JSONB DEFAULT '{}'::jsonb, -- Per-field confidence scores
    -- Structure: {"process_number": 98.5, "court": 95.2, "parties": 87.3}
    
    -- Raw extraction data
    raw_ocr_output JSONB,                      -- Raw OCR output for debugging
    extraction_warnings TEXT[],                -- Warnings during extraction
    
    -- Processing info
    processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reprocessed_count INTEGER DEFAULT 0,
    last_reprocessed_at TIMESTAMP WITH TIME ZONE,
    
    -- Validation status
    validation_status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, VALIDATED, REJECTED
    validated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    validated_at TIMESTAMP WITH TIME ZONE,
    validation_notes TEXT,
    
    -- Manual corrections
    manual_corrections JSONB DEFAULT '{}'::jsonb, -- Store manual edits
    corrections_by UUID REFERENCES users(id) ON DELETE SET NULL,
    corrections_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Constraints
    CONSTRAINT valid_validation_status CHECK (
        validation_status IN ('PENDING', 'VALIDATED', 'REJECTED', 'NEEDS_REVIEW')
    ),
    CONSTRAINT unique_document_extraction UNIQUE (tenant_id, document_id)
);

-- Indexes for document_extractions
CREATE INDEX IF NOT EXISTS idx_doc_extractions_tenant_id ON document_extractions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doc_extractions_document_id ON document_extractions(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_extractions_process_number ON document_extractions(process_number) WHERE process_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_doc_extractions_court ON document_extractions(court) WHERE court IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_doc_extractions_validation_status ON document_extractions(validation_status);
CREATE INDEX IF NOT EXISTS idx_doc_extractions_processed_at ON document_extractions(processed_at);
CREATE INDEX IF NOT EXISTS idx_doc_extractions_overall_confidence ON document_extractions(overall_confidence);

-- GIN indexes for JSONB fields
CREATE INDEX IF NOT EXISTS idx_doc_extractions_parties ON document_extractions USING GIN(parties);
CREATE INDEX IF NOT EXISTS idx_doc_extractions_monetary_values ON document_extractions USING GIN(monetary_values);
CREATE INDEX IF NOT EXISTS idx_doc_extractions_field_confidences ON document_extractions USING GIN(field_confidences);

-- Full text search on extracted text
CREATE INDEX IF NOT EXISTS idx_doc_extractions_text_search ON document_extractions 
    USING GIN(to_tsvector('portuguese', COALESCE(extracted_text, '')));

-- ============================================
-- DOCUMENT_QUALITY_FLAGS TABLE
-- Tracks quality issues and sanitation queue
-- ============================================
CREATE TABLE IF NOT EXISTS document_quality_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Multi-tenant isolation
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Document reference
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    
    -- Quality flag details
    flag_type VARCHAR(50) NOT NULL,            -- DPI_LOW, OCR_CONFIDENCE_LOW, CORRUPT_FILE, etc.
    flag_code VARCHAR(50) NOT NULL,            -- Machine-readable code
    severity VARCHAR(20) NOT NULL DEFAULT 'WARNING', -- ERROR, WARNING, INFO
    
    -- Flag data
    flag_message TEXT NOT NULL,                -- Human-readable message
    flag_details JSONB DEFAULT '{}'::jsonb,    -- Additional details
    -- For DPI: {"detected_dpi": 150, "required_dpi": 300}
    -- For OCR: {"confidence": 82.5, "required_confidence": 95}
    
    -- Thresholds at time of flagging
    threshold_value DECIMAL(10, 2),            -- The threshold that was violated
    actual_value DECIMAL(10, 2),               -- The actual value detected
    
    -- Sanitation queue status
    queue_status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, IN_REVIEW, RESOLVED, DISMISSED
    queued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Resolution
    resolution_action VARCHAR(100),            -- RESCANNED, MANUAL_OVERRIDE, DISMISSED, REPROCESSED
    resolution_notes TEXT,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Auto-resolution attempts
    auto_resolution_attempted BOOLEAN DEFAULT false,
    auto_resolution_result TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Constraints
    CONSTRAINT valid_flag_type CHECK (
        flag_type IN (
            'DPI_LOW', 'DPI_UNDETECTABLE',
            'OCR_CONFIDENCE_LOW', 'OCR_FAILED',
            'CORRUPT_FILE', 'INVALID_FORMAT', 'ENCRYPTED_FILE',
            'MISSING_PAGES', 'BLANK_PAGES',
            'EXTRACTION_FAILED', 'EXTRACTION_INCOMPLETE',
            'DUPLICATE_CONTENT', 'MANUAL_REVIEW_REQUIRED'
        )
    ),
    CONSTRAINT valid_severity CHECK (severity IN ('ERROR', 'WARNING', 'INFO')),
    CONSTRAINT valid_queue_status CHECK (
        queue_status IN ('PENDING', 'IN_REVIEW', 'RESOLVED', 'DISMISSED', 'ESCALATED')
    )
);

-- Indexes for document_quality_flags
CREATE INDEX IF NOT EXISTS idx_doc_quality_flags_tenant_id ON document_quality_flags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doc_quality_flags_document_id ON document_quality_flags(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_quality_flags_flag_type ON document_quality_flags(flag_type);
CREATE INDEX IF NOT EXISTS idx_doc_quality_flags_severity ON document_quality_flags(severity);
CREATE INDEX IF NOT EXISTS idx_doc_quality_flags_queue_status ON document_quality_flags(queue_status);
CREATE INDEX IF NOT EXISTS idx_doc_quality_flags_queued_at ON document_quality_flags(queued_at) WHERE queue_status = 'PENDING';

-- Composite indexes
CREATE INDEX IF NOT EXISTS idx_doc_quality_flags_tenant_queue ON document_quality_flags(tenant_id, queue_status);
CREATE INDEX IF NOT EXISTS idx_doc_quality_flags_tenant_severity ON document_quality_flags(tenant_id, severity);

-- ============================================
-- SANITATION_QUEUE VIEW
-- Convenience view for documents needing review
-- ============================================
-- View: documents may not have created_by; use NULL if column missing
CREATE OR REPLACE VIEW sanitation_queue AS
SELECT 
    qf.id AS flag_id,
    qf.tenant_id,
    qf.document_id,
    d.file_hash_sha256 AS document_number,
    NULL::VARCHAR AS document_title,
    d.storage_path AS file_name,
    d.status_cpo,
    qf.flag_type,
    qf.flag_code,
    qf.severity,
    qf.flag_message,
    qf.flag_details,
    qf.threshold_value,
    qf.actual_value,
    qf.queue_status,
    qf.queued_at,
    qf.resolution_action,
    qf.resolved_by,
    qf.resolved_at,
    NULL::UUID AS uploaded_by,
    NULL::VARCHAR AS uploaded_by_email,
    d.created_at AS document_created_at
FROM document_quality_flags qf
JOIN documents d ON qf.document_id = d.id AND qf.tenant_id = d.tenant_id
WHERE qf.queue_status IN ('PENDING', 'IN_REVIEW', 'ESCALATED')
ORDER BY 
    CASE qf.severity 
        WHEN 'ERROR' THEN 1 
        WHEN 'WARNING' THEN 2 
        ELSE 3 
    END,
    qf.queued_at ASC;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to add quality flag and update document status
CREATE OR REPLACE FUNCTION add_document_quality_flag(
    p_tenant_id UUID,
    p_document_id UUID,
    p_flag_type VARCHAR(50),
    p_flag_code VARCHAR(50),
    p_severity VARCHAR(20),
    p_message TEXT,
    p_details JSONB DEFAULT '{}',
    p_threshold DECIMAL(10,2) DEFAULT NULL,
    p_actual DECIMAL(10,2) DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_flag_id UUID;
    v_new_status_cpo VARCHAR(20);
BEGIN
    -- Insert the quality flag
    INSERT INTO document_quality_flags (
        tenant_id, document_id, flag_type, flag_code, severity,
        flag_message, flag_details, threshold_value, actual_value
    ) VALUES (
        p_tenant_id, p_document_id, p_flag_type, p_flag_code, p_severity,
        p_message, p_details, p_threshold, p_actual
    ) RETURNING id INTO v_flag_id;
    
    -- Determine new CPO status based on severity
    IF p_severity = 'ERROR' THEN
        v_new_status_cpo := 'VERMELHO';
    ELSIF p_severity = 'WARNING' THEN
        v_new_status_cpo := 'AMARELO';
    ELSE
        v_new_status_cpo := 'VERDE';
    END IF;
    
    -- Update document CPO status if more severe
    UPDATE documents
    SET status_cpo = CASE
        WHEN status_cpo IS NULL THEN v_new_status_cpo
        WHEN status_cpo = 'VERDE' AND v_new_status_cpo IN ('AMARELO', 'VERMELHO') THEN v_new_status_cpo
        WHEN status_cpo = 'AMARELO' AND v_new_status_cpo = 'VERMELHO' THEN v_new_status_cpo
        ELSE status_cpo
    END,
    cpo_approval_required = CASE
        WHEN p_severity IN ('ERROR', 'WARNING') THEN true
        ELSE cpo_approval_required
    END,
    updated_at = CURRENT_TIMESTAMP
    WHERE id = p_document_id AND tenant_id = p_tenant_id;
    
    RETURN v_flag_id;
END;
$$ LANGUAGE plpgsql;

-- Function to resolve quality flag
CREATE OR REPLACE FUNCTION resolve_document_quality_flag(
    p_flag_id UUID,
    p_tenant_id UUID,
    p_resolution_action VARCHAR(100),
    p_resolution_notes TEXT,
    p_resolved_by UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_document_id UUID;
    v_pending_flags INTEGER;
BEGIN
    -- Update the flag
    UPDATE document_quality_flags
    SET queue_status = 'RESOLVED',
        resolution_action = p_resolution_action,
        resolution_notes = p_resolution_notes,
        resolved_by = p_resolved_by,
        resolved_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_flag_id AND tenant_id = p_tenant_id
    RETURNING document_id INTO v_document_id;
    
    IF v_document_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check if there are remaining unresolved flags
    SELECT COUNT(*) INTO v_pending_flags
    FROM document_quality_flags
    WHERE document_id = v_document_id
      AND tenant_id = p_tenant_id
      AND queue_status IN ('PENDING', 'IN_REVIEW', 'ESCALATED');
    
    -- If no pending flags, update document CPO status to VERDE
    IF v_pending_flags = 0 THEN
        UPDATE documents
        SET status_cpo = 'VERDE',
            cpo_approval_required = false,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_document_id AND tenant_id = p_tenant_id;
    END IF;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS (idempotent)
-- ============================================

DROP TRIGGER IF EXISTS update_document_extractions_updated_at ON document_extractions;
CREATE TRIGGER update_document_extractions_updated_at
    BEFORE UPDATE ON document_extractions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_document_quality_flags_updated_at ON document_quality_flags;
CREATE TRIGGER update_document_quality_flags_updated_at
    BEFORE UPDATE ON document_quality_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE document_extractions IS 'Stores extracted structured data from legal documents (Legal Engine)';
COMMENT ON TABLE document_quality_flags IS 'Tracks quality issues and sanitation queue for documents';
COMMENT ON VIEW sanitation_queue IS 'Documents pending quality review';
COMMENT ON FUNCTION add_document_quality_flag IS 'Adds quality flag and updates document CPO status';
COMMENT ON FUNCTION resolve_document_quality_flag IS 'Resolves quality flag and recalculates document CPO status';

COMMENT ON COLUMN document_extractions.process_number IS 'Brazilian legal process number (e.g., 0001234-56.2023.8.26.0100)';
COMMENT ON COLUMN document_extractions.parties IS 'JSON array of parties involved in the legal document';
COMMENT ON COLUMN document_extractions.monetary_values IS 'JSON array of monetary values extracted from the document';
COMMENT ON COLUMN document_extractions.overall_confidence IS 'Overall extraction confidence score (0-100)';

COMMENT ON COLUMN document_quality_flags.flag_type IS 'Type of quality issue (DPI_LOW, OCR_CONFIDENCE_LOW, etc.)';
COMMENT ON COLUMN document_quality_flags.queue_status IS 'Status in the sanitation queue';
