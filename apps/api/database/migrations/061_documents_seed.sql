-- Migration 061: Seed sample documents for the legal module
-- Documents table requires: tenant_id, file_hash_sha256, storage_path,
-- ocr_confidence, dpi_resolution, status_cpo

DO $$
DECLARE
  v_tenant UUID := '00000000-0000-0000-0000-000000000001';
BEGIN

INSERT INTO documents (
  tenant_id, file_hash_sha256, storage_path,
  ocr_confidence, dpi_resolution, status_cpo
) VALUES
  (v_tenant,
   'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
   'uploads/tenant-001/escritura-moema-2024.pdf',
   0.97, 300, 'VERDE'),

  (v_tenant,
   'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
   'uploads/tenant-001/matricula-santo-andre.pdf',
   0.91, 300, 'VERDE'),

  (v_tenant,
   'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
   'uploads/tenant-001/contrato-usucapiao-docs.pdf',
   0.88, 200, 'AMARELO'),

  (v_tenant,
   'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
   'uploads/tenant-001/distrato-alphaville.pdf',
   0.96, 300, 'VERDE'),

  (v_tenant,
   'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
   'uploads/tenant-001/laudo-pericial-terreno.pdf',
   0.72, 150, 'VERMELHO')
ON CONFLICT DO NOTHING;

END $$;
