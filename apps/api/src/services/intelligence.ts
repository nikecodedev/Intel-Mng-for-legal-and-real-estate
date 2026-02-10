/**
 * Rule-bound intelligence layer.
 * - Validates data completeness, detects inconsistencies, suggests improvements (non-destructive).
 * - Refuses operations when rules are violated.
 * - AI cannot override: CPO status, risk blocks, workflow gates.
 * - All explanations deterministic; all suggestions logged. No autonomous execution.
 */

import { AuditService, AuditAction, AuditEventCategory } from './audit.js';
import type { Request } from 'express';
import {
  type IntelligenceResult,
  type IntelligenceFinding,
  IntelligenceRuleCode,
  RULE_MESSAGES,
  type FindingSeverity,
} from '../types/intelligence.js';
import { DocumentModel } from '../models/document.js';
import { AuctionAssetModel, isRiskHigh } from '../models/auction-asset.js';
import { AuctionAssetROIModel } from '../models/auction-asset-roi.js';

export type IntelligenceResourceType = 'document' | 'auction_asset' | 'auction_asset_roi';

export type IntelligenceOperationContext =
  | 'generate_document'   // requires CPO-approved sources
  | 'place_bid'           // requires not risk HIGH
  | 'transition'          // requires workflow gate pass
  | 'general';

export interface IntelligenceValidateInput {
  tenantId: string;
  resourceType: IntelligenceResourceType;
  resourceId: string;
  operation?: IntelligenceOperationContext;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  request?: Request;
}

function finding(
  code: IntelligenceRuleCode,
  severity: FindingSeverity,
  params?: Record<string, unknown>
): IntelligenceFinding {
  return {
    code,
    severity,
    message: RULE_MESSAGES[code],
    params,
  };
}

/**
 * Run rule-bound validation. Does not modify CPO, risk, or workflow state.
 * Returns violations (refuse) + suggestions + completeness + inconsistencies.
 */
export async function validate(
  input: IntelligenceValidateInput
): Promise<IntelligenceResult> {
  const violations: IntelligenceFinding[] = [];
  const suggestions: IntelligenceFinding[] = [];
  const completeness: IntelligenceFinding[] = [];
  const inconsistencies: IntelligenceFinding[] = [];

  const { tenantId, resourceType, resourceId, operation = 'general' } = input;

  if (resourceType === 'document') {
    const doc = await DocumentModel.findById(resourceId, tenantId);
    if (doc) {
      if (!doc.title?.trim()) completeness.push(finding('INCOMPLETE_DOCUMENT', 'info', { field: 'title' }));
      if (doc.status === 'APPROVED' && doc.status_cpo !== 'VERDE') {
        inconsistencies.push(finding('INCONSISTENT_DOCUMENT_CPO', 'suggestion'));
      }
    }
  }

  if (resourceType === 'auction_asset') {
    const asset = await AuctionAssetModel.findById(resourceId, tenantId);
    if (asset) {
      const dd = asset.due_diligence_checklist;
      const hasPending = ['occupancy', 'debts', 'legal_risks', 'zoning'].some(
        (k) => (dd as Record<string, { status: string }>)[k]?.status === 'pending' || (dd as Record<string, { status: string }>)[k]?.status === 'risk'
      );
      if (hasPending) completeness.push(finding('INCOMPLETE_DUE_DILIGENCE', 'info'));
      if (asset.linked_document_ids.length === 0) {
        suggestions.push(finding('SUGGEST_LINK_DOCUMENTS', 'suggestion'));
      }
      if (hasPending) suggestions.push(finding('SUGGEST_COMPLETE_DUE_DILIGENCE', 'suggestion'));

      if (operation === 'place_bid' && isRiskHigh(asset.risk_score)) {
        violations.push(finding('VIOLATION_RISK_BLOCK_ACTIVE', 'violation', { risk_score: asset.risk_score }));
      }
    }
  }

  const assetIdForRoi = resourceType === 'auction_asset_roi' ? resourceId : resourceType === 'auction_asset' ? resourceId : undefined;
  if (assetIdForRoi) {
    const roi = await AuctionAssetROIModel.getByAssetId(
      assetIdForRoi,
      tenantId
    );
    if (roi) {
      const hasMinInputs =
        roi.acquisition_price_cents > 0 && roi.expected_resale_value_cents > 0;
      if (!hasMinInputs) completeness.push(finding('INCOMPLETE_ROI_INPUTS', 'info'));
      if (roi.net_profit_cents < 0) {
        inconsistencies.push(finding('INCONSISTENT_ROI_NEGATIVE_PROFIT', 'suggestion', { net_profit_cents: roi.net_profit_cents }));
      }
      if (!roi.expected_resale_date) {
        suggestions.push(finding('SUGGEST_ADD_BREAK_EVEN_DATE', 'suggestion'));
      }
    }

    if (operation === 'place_bid' && resourceType === 'auction_asset_roi') {
      const asset = await AuctionAssetModel.findById(assetIdForRoi, tenantId);
      if (asset && isRiskHigh(asset.risk_score)) {
        violations.push(finding('VIOLATION_RISK_BLOCK_ACTIVE', 'violation', { risk_score: asset.risk_score }));
      }
    }
  }

  if (operation === 'generate_document') {
    const doc = await DocumentModel.findById(resourceId, tenantId);
    if (doc && doc.status_cpo !== 'VERDE' && doc.cpo_approved_at == null) {
      violations.push(finding('VIOLATION_CPO_NOT_APPROVED', 'violation', { document_id: resourceId }));
    }
  }

  const allowed = violations.length === 0;
  const result: IntelligenceResult = {
    allowed,
    violations,
    suggestions,
    completeness,
    inconsistencies,
  };

  await logIntelligenceResult(input, result);
  return result;
}

/**
 * Validate for an operation that depends on workflow gate (e.g. before transition).
 * Caller must have already run workflow emit; pass workflowBlocked=true if workflow returned blocked.
 * We add VIOLATION_WORKFLOW_BLOCK_ACTIVE and do not override the workflow.
 */
export function addWorkflowViolationIfBlocked(
  result: IntelligenceResult,
  workflowBlocked: boolean
): IntelligenceResult {
  if (!workflowBlocked) return result;
  const violation: IntelligenceFinding = {
    code: 'VIOLATION_WORKFLOW_BLOCK_ACTIVE',
    severity: 'violation',
    message: RULE_MESSAGES.VIOLATION_WORKFLOW_BLOCK_ACTIVE,
  };
  return {
    ...result,
    allowed: false,
    violations: [...result.violations, violation],
  };
}

async function logIntelligenceResult(
  input: IntelligenceValidateInput,
  result: IntelligenceResult
): Promise<void> {
  const { tenantId, userId, userEmail, userRole, request } = input;

  for (const s of result.suggestions) {
    await AuditService.log({
      tenant_id: tenantId,
      event_type: 'intelligence.suggestion',
      event_category: AuditEventCategory.COMPLIANCE,
      action: AuditAction.READ,
      user_id: userId,
      user_email: userEmail,
      user_role: userRole,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      description: `Intelligence suggestion: ${s.code}`,
      details: { code: s.code, message: s.message, params: s.params },
      ip_address: request?.ip ?? request?.socket?.remoteAddress,
      user_agent: request?.get('user-agent'),
      request_id: request?.headers?.['x-request-id'] as string | undefined,
      session_id: request?.headers?.['x-session-id'] as string | undefined,
      success: true,
      compliance_flags: ['intelligence'],
      retention_category: 'intelligence',
    });
  }

  if (!result.allowed && result.violations.length > 0) {
    await AuditService.log({
      tenant_id: tenantId,
      event_type: 'intelligence.refusal',
      event_category: AuditEventCategory.COMPLIANCE,
      action: AuditAction.READ,
      user_id: userId,
      user_email: userEmail,
      user_role: userRole,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      description: 'Operation refused by rule-bound intelligence',
      details: {
        violations: result.violations.map((v) => ({ code: v.code, message: v.message })),
      },
      ip_address: request?.ip ?? request?.socket?.remoteAddress,
      user_agent: request?.get('user-agent'),
      request_id: request?.headers?.['x-request-id'] as string | undefined,
      session_id: request?.headers?.['x-session-id'] as string | undefined,
      success: false,
      compliance_flags: ['intelligence'],
      retention_category: 'intelligence',
    });
  }
}
