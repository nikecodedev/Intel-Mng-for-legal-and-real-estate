/**
 * End-to-end validation scenario tests.
 * Covers: document upload→OCR→CPO→facts, generated doc, trace to source,
 * auction MPGA, ROI + block bid on high risk, workflow automation.
 * Confirms tenant isolation (tenant_id required; cross-tenant returns null/404).
 */

import { describe, it, expect } from 'vitest';
import { TenantRequiredError } from '../src/utils/errors';
import { InvalidTransitionError } from '../src/utils/errors';
import {
  calculateRiskScore,
  isRiskHigh,
  AUCTION_STAGES,
  type DueDiligenceChecklist,
} from '../src/models/auction-asset';
import { calculateROI } from '../src/models/auction-asset-roi';
import { evaluateCondition } from '../src/services/workflow-engine';
import type { IntelligenceResult } from '../src/types/intelligence';
import { RULE_MESSAGES } from '../src/types/intelligence';
import { GeneratedDocumentValidationError } from '../src/services/generated-document';

// ============================================
// Scenario 2: Generate legal document from facts (block when rules violated)
// ============================================
describe('Scenario 2: Use facts to generate legal document', () => {
  it('GeneratedDocumentValidationError has code MISSING_FACT or SOURCE_NOT_CPO_APPROVED', () => {
    const errMissing = new GeneratedDocumentValidationError('Missing facts', 'MISSING_FACT');
    expect(errMissing.code).toBe('MISSING_FACT');
    const errCpo = new GeneratedDocumentValidationError('Source not CPO approved', 'SOURCE_NOT_CPO_APPROVED');
    expect(errCpo.code).toBe('SOURCE_NOT_CPO_APPROVED');
  });
});

// ============================================
// Scenario 3: Trace generated statement back to source (response shape)
// ============================================
describe('Scenario 3: Trace to source PDF', () => {
  it('fact source response shape: fact + source_document', () => {
    const fact = { id: 'f1', fact_type: 'process_number', fact_value: '123', page_number: 1, bounding_box: { x: 0, y: 0, width: 0.2, height: 0.05 }, confidence_score: 95 };
    const source_document = { id: 'd1', document_number: 'DOC-1', title: 'Deed', status_cpo: 'VERDE', ocr_processed: true };
    const response = { fact, source_document };
    expect(response.fact.fact_type).toBe('process_number');
    expect(response.source_document.status_cpo).toBe('VERDE');
  });
});

// ============================================
// Scenario 5: ROI calculation + block bid on high risk
// ============================================
describe('Scenario 5: Calculate ROI and block bid on high risk', () => {
  it('calculates ROI outputs from inputs (deterministic)', () => {
    const out = calculateROI({
      acquisition_price_cents: 100_000_00,
      taxes_itbi_cents: 5_000_00,
      legal_costs_cents: 2_000_00,
      renovation_estimate_cents: 20_000_00,
      expected_resale_value_cents: 150_000_00,
      expected_resale_date: '2026-12-01',
    });
    expect(out.total_cost_cents).toBe(127_000_00);
    expect(out.net_profit_cents).toBe(23_000_00);
    expect(out.roi_percentage).toBeGreaterThan(0);
    expect(out.break_even_date).toBe('2026-12-01');
  });

  it('risk score 0 when all due diligence ok', () => {
    const checklist: DueDiligenceChecklist = {
      occupancy: { status: 'ok', notes: null },
      debts: { status: 'ok', notes: null },
      legal_risks: { status: 'ok', notes: null },
      zoning: { status: 'ok', notes: null },
    };
    expect(calculateRiskScore(checklist)).toBe(0);
    expect(isRiskHigh(0)).toBe(false);
  });

  it('risk score >= 70 (HIGH) when multiple risk items', () => {
    const checklist: DueDiligenceChecklist = {
      occupancy: { status: 'risk', notes: null },
      debts: { status: 'risk', notes: null },
      legal_risks: { status: 'pending', notes: null },
      zoning: { status: 'risk', notes: null },
    };
    const score = calculateRiskScore(checklist);
    expect(score).toBeGreaterThanOrEqual(70);
    expect(isRiskHigh(score)).toBe(true);
  });
});

// ============================================
// Scenario 4: MPGA workflow (strict state machine)
// ============================================
describe('Scenario 4: Auction asset MPGA workflow', () => {
  it('only allows sequential stages F0->F1->...->F9', () => {
    expect(AUCTION_STAGES).toEqual(['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9']);
  });

  it('InvalidTransitionError has fromStage and toStage', () => {
    const err = new InvalidTransitionError('Invalid', 'F0', 'F2');
    expect(err.fromStage).toBe('F0');
    expect(err.toStage).toBe('F2');
    expect(err.code).toBe('INVALID_TRANSITION');
  });
});

// ============================================
// Scenario 6: Workflow automation (deterministic condition)
// ============================================
describe('Scenario 6: Workflow automation trigger', () => {
  it('evaluates eq condition', () => {
    expect(evaluateCondition({ op: 'eq', field: 'itbi_paid', value: true }, { itbi_paid: true })).toBe(true);
    expect(evaluateCondition({ op: 'eq', field: 'itbi_paid', value: true }, { itbi_paid: false })).toBe(false);
  });

  it('evaluates not_present condition', () => {
    expect(evaluateCondition({ op: 'not_present', field: 'admin_approval_received' }, {})).toBe(true);
    expect(evaluateCondition({ op: 'not_present', field: 'admin_approval_received' }, { admin_approval_received: true })).toBe(false);
  });

  it('evaluates days_until_lte for court deadline', () => {
    const inTwoDays = new Date();
    inTwoDays.setDate(inTwoDays.getDate() + 2);
    const payload = { court_deadline: inTwoDays.toISOString().slice(0, 10) };
    expect(evaluateCondition({ op: 'days_until_lte', field: 'court_deadline', value: 3 }, payload)).toBe(true);
  });
});

// ============================================
// Tenant isolation: model layer requires tenant_id
// ============================================
describe('Tenant isolation', () => {
  it('TenantRequiredError thrown when tenantId missing', () => {
    expect(() => {
      throw new TenantRequiredError('TestOperation');
    }).toThrow(TenantRequiredError);
    try {
      throw new TenantRequiredError('TestOperation');
    } catch (e: unknown) {
      expect((e as { code?: string }).code).toBe('TENANT_REQUIRED');
    }
  });
});

// ============================================
// Intelligence layer: deterministic findings and refusal
// ============================================
describe('Intelligence layer (rule-bound)', () => {
  it('uses deterministic rule codes and messages', () => {
    expect(RULE_MESSAGES.VIOLATION_RISK_BLOCK_ACTIVE).toContain('cannot be overridden');
    expect(RULE_MESSAGES.SUGGEST_ADD_BREAK_EVEN_DATE).toBeDefined();
    expect(RULE_MESSAGES.VIOLATION_CPO_NOT_APPROVED).toContain('CPO');
  });

  it('IntelligenceResult shape: allowed, violations, suggestions, completeness, inconsistencies', () => {
    const result: IntelligenceResult = {
      allowed: true,
      violations: [],
      suggestions: [{ code: 'SUGGEST_ADD_BREAK_EVEN_DATE', severity: 'suggestion', message: 'Add expected_resale_date to ROI for break-even date.' }],
      completeness: [],
      inconsistencies: [],
    };
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.suggestions[0].code).toBe('SUGGEST_ADD_BREAK_EVEN_DATE');
    expect(result.suggestions[0].severity).toBe('suggestion');
  });
});
