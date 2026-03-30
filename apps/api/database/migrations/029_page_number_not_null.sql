-- Make page_number NOT NULL for document_facts (FPDN compliance)
UPDATE document_facts SET page_number = 1 WHERE page_number IS NULL;
ALTER TABLE document_facts ALTER COLUMN page_number SET DEFAULT 1;
ALTER TABLE document_facts ALTER COLUMN page_number SET NOT NULL;
