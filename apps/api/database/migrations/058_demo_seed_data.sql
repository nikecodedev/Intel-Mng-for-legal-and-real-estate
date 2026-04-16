-- Migration 058: Demo seed data for all modules
-- Populates: auction_assets, real_estate_assets, legal_cases,
--            financial_transactions, investor_users, crm_proposals
-- Test password for investor_users: "Gems@2024!" (bcrypt rounds=10)
-- All records use the system tenant: 00000000-0000-0000-0000-000000000001

DO $$
DECLARE
  v_tenant UUID := '00000000-0000-0000-0000-000000000001';

  -- Auction asset UUIDs
  v_auction1 UUID := '11111111-0000-0000-0000-000000000001';
  v_auction2 UUID := '11111111-0000-0000-0000-000000000002';
  v_auction3 UUID := '11111111-0000-0000-0000-000000000003';

  -- Real estate asset UUIDs
  v_re1 UUID := '22222222-0000-0000-0000-000000000001';
  v_re2 UUID := '22222222-0000-0000-0000-000000000002';
  v_re3 UUID := '22222222-0000-0000-0000-000000000003';

  -- Legal case UUIDs
  v_case1 UUID := '33333333-0000-0000-0000-000000000001';
  v_case2 UUID := '33333333-0000-0000-0000-000000000002';
  v_case3 UUID := '33333333-0000-0000-0000-000000000003';

  -- Investor UUIDs
  v_inv1 UUID := '55555555-0000-0000-0000-000000000001';
  v_inv2 UUID := '55555555-0000-0000-0000-000000000002';
  v_inv3 UUID := '55555555-0000-0000-0000-000000000003';

  -- bcrypt("Gems@2024!", 10) — demo hash, do not use in production
  v_pw_hash TEXT := '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

BEGIN

-- ============================================================
-- AUCTION ASSETS (Leilões)
-- Columns minimum_bid_cents, appraisal_value_cents, total_debt_cents added by 059
-- ============================================================
INSERT INTO auction_assets (
  id, tenant_id, current_stage, title, asset_reference,
  minimum_bid_cents, appraisal_value_cents, total_debt_cents, certidoes_negativas
) VALUES
  (v_auction1, v_tenant, 'F2', 'Apartamento 3 quartos – Moema SP', 'LEIL-2024-001',
   42000000, 50000000, 3000000, true),
  (v_auction2, v_tenant, 'F4', 'Terreno Industrial – Santo André SP', 'LEIL-2024-002',
   260000000, 320000000, 45000000, true),
  (v_auction3, v_tenant, 'F6', 'Casa Duplex – Alphaville SP', 'LEIL-2024-003',
   180000000, 200000000, 8000000, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- REAL ESTATE ASSETS (Imóveis)
-- ============================================================
INSERT INTO real_estate_assets (
  id, tenant_id, asset_code, property_address, property_type,
  property_size_sqm, current_state, acquisition_price_cents,
  acquisition_date, source_auction_id, is_vacant
) VALUES
  (v_re1, v_tenant, 'PROP-2024-001',
   'Rua das Flores, 123 – Moema, São Paulo – SP',
   'RESIDENTIAL', 98.50, 'REGULARIZACAO',
   45000000, '2024-03-15', v_auction1, false),

  (v_re2, v_tenant, 'PROP-2024-002',
   'Av. Industrial, 450 – Santo André – SP',
   'COMMERCIAL', 320.00, 'REFORMA',
   280000000, '2024-06-01', v_auction2, true),

  (v_re3, v_tenant, 'PROP-2024-003',
   'Rua das Palmeiras, 88 – Alphaville, Barueri – SP',
   'RESIDENTIAL', 210.00, 'PRONTO',
   195000000, '2024-01-20', v_auction3, false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- LEGAL CASES (Jurídico)
-- ============================================================
INSERT INTO legal_cases (
  id, tenant_id, case_number, title, client_name, status,
  qg4_score, deadline, description
) VALUES
  (v_case1, v_tenant, 'PROC-2024-001',
   'Regularização Escritura – Moema',
   'João da Silva', 'EM_ANDAMENTO',
   0.87, '2025-03-30',
   'Regularização de escritura de imóvel adquirido em leilão. Pendente ITBI e registro em cartório.'),

  (v_case2, v_tenant, 'PROC-2024-002',
   'Ação de Usucapião – Terreno Industrial',
   'Construtora ABC Ltda', 'AGUARDANDO_DOCUMENTOS',
   NULL, '2025-06-15',
   'Processo de usucapião para regularização de posse. Aguarda laudos periciais e documentação complementar.'),

  (v_case3, v_tenant, 'PROC-2024-003',
   'Distrato de Compra e Venda – Alphaville',
   'Maria Oliveira', 'ABERTO',
   0.92, '2025-02-28',
   'Análise de contrato para distrato amigável. Identificadas cláusulas de penalidade que requerem renegociação.')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- FINANCIAL TRANSACTIONS (Financeiro)
-- Constraint 057 (NOT VALID): new rows need process_id OR real_estate_asset_id
-- Using real_estate_asset_id to satisfy constraint
-- ============================================================
INSERT INTO financial_transactions (
  tenant_id, transaction_number, transaction_type, description,
  amount_cents, transaction_date, payment_status, real_estate_asset_id,
  requires_owner_approval
) VALUES
  -- Small expense (below R$5.000 threshold — no owner approval needed)
  (v_tenant, 'TXN-2024-001', 'EXPENSE',
   'Despesas cartoriais – PROP-2024-001',
   32000, '2024-11-10', 'PAID', v_re1, false),

  -- Large expense (above R$5.000 threshold — requires owner approval)
  (v_tenant, 'TXN-2024-002', 'EXPENSE',
   'Reforma estrutural – PROP-2024-002',
   1850000, '2024-11-20', 'PENDING', v_re2, true),

  -- Income
  (v_tenant, 'TXN-2024-003', 'INCOME',
   'Aluguel mensal – PROP-2024-001',
   450000, '2024-12-01', 'PAID', v_re1, false),

  -- Large acquisition (above R$5.000 — requires approval)
  (v_tenant, 'TXN-2024-004', 'EXPENSE',
   'Aquisição em leilão – PROP-2024-003',
   19500000, '2024-01-20', 'PAID', v_re3, true),

  -- Pending income
  (v_tenant, 'TXN-2024-005', 'INCOME',
   'Venda planejada – PROP-2024-003 (sinal)',
   5000000, '2025-01-15', 'PENDING', v_re3, false)
ON CONFLICT (transaction_number, tenant_id) DO NOTHING;

-- ============================================================
-- INVESTOR USERS (CRM / Portal do Investidor)
-- Test password: "password" (bcrypt $2b$10$92IXUNpkjO0rOQ5byMi...)
-- ============================================================
INSERT INTO investor_users (
  id, tenant_id, email, password_hash,
  first_name, last_name, company_name, is_active, is_email_verified
) VALUES
  (v_inv1, v_tenant,
   'carlos.mendes@investimentos.com.br', v_pw_hash,
   'Carlos', 'Mendes', 'Mendes Capital Investimentos', true, true),

  (v_inv2, v_tenant,
   'ana.souza@patrimonial.com.br', v_pw_hash,
   'Ana', 'Souza', 'Souza Patrimonial Ltda', true, true),

  (v_inv3, v_tenant,
   'roberto.lima@realestate.com.br', v_pw_hash,
   'Roberto', 'Lima', 'Lima Real Estate Fund', true, false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- CRM PROPOSALS (linking investors to auction assets)
-- ============================================================
INSERT INTO crm_proposals (
  tenant_id, investor_user_id, auction_asset_id,
  title, description, proposed_amount_cents, status
) VALUES
  (v_tenant, v_inv1, v_auction3,
   'Proposta – Casa Alphaville',
   'Interesse na aquisição pós-leilão. Aguarda laudo de avaliação.',
   190000000, 'ANALYSIS'),

  (v_tenant, v_inv2, v_auction1,
   'Proposta – Apartamento Moema',
   'Proposta condicionada à regularização da escritura.',
   48000000, 'DRAFT'),

  (v_tenant, v_inv3, v_auction2,
   'Proposta – Terreno Industrial Santo André',
   'Interesse para desenvolvimento de galpão logístico.',
   285000000, 'SUBMITTED')
ON CONFLICT (id) DO NOTHING;

END $$;
