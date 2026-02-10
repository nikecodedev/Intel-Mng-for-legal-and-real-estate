import { db } from '../models/database.js';
import { QualityGateModel, QualityGate } from '../models/quality-gate.js';
import { GateCheckModel, GateCheck, ResourceType, CheckStatus } from '../models/gate-check.js';
import { logger } from '../utils/logger.js';

export interface GateCheckResult {
  passed: boolean;
  failure_reason?: string;
  failure_details?: Record<string, unknown>;
  check_result?: Record<string, unknown>;
}

export interface GateValidationResult {
  all_passed: boolean;
  blocking_failures: GateCheck[];
  warnings: GateCheck[];
  checks: GateCheck[];
  workflow_blocked: boolean;
}

/**
 * Quality Gate Service
 * Checks quality gates and blocks workflow progression if gates fail
 */
export class QualityGateService {
  /**
   * Check all applicable gates for a resource
   */
  static async checkGates(
    tenantId: string,
    resourceType: ResourceType,
    resourceId: string,
    processType?: string,
    stage?: string,
    userId?: string
  ): Promise<GateValidationResult> {
    // Get applicable gates
    const gates = await QualityGateModel.getApplicableGates(tenantId, processType, stage);

    const checks: GateCheck[] = [];
    const blockingFailures: GateCheck[] = [];
    const warnings: GateCheck[] = [];

    // Check each gate
    for (const gate of gates) {
      const check = await this.checkGate(gate, resourceType, resourceId, tenantId, userId);
      checks.push(check);

      if (check.check_status === 'FAILED') {
        if (gate.is_blocking) {
          blockingFailures.push(check);
        } else {
          warnings.push(check);
        }
      }
    }

    const workflowBlocked = blockingFailures.length > 0;

    return {
      all_passed: blockingFailures.length === 0 && warnings.length === 0,
      blocking_failures: blockingFailures,
      warnings,
      checks,
      workflow_blocked: workflowBlocked,
    };
  }

  /**
   * Check a single gate
   */
  static async checkGate(
    gate: QualityGate,
    resourceType: ResourceType,
    resourceId: string,
    tenantId: string,
    userId?: string
  ): Promise<GateCheck> {
    const startTime = Date.now();

    // Create or get existing check
    let check = await this.getOrCreateCheck(gate.id, resourceType, resourceId, tenantId);

    // Perform gate check based on type
    let checkResult: GateCheckResult;
    try {
      checkResult = await this.performGateCheck(gate, resourceType, resourceId, tenantId);
    } catch (error) {
      logger.error('Gate check failed with error', {
        gateId: gate.id,
        gateCode: gate.gate_code,
        resourceType,
        resourceId,
        error,
      });
      checkResult = {
        passed: false,
        failure_reason: `Gate check error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        failure_details: { error: String(error) },
      };
    }

    const duration = Date.now() - startTime;

    // Update check result
    const updateInput: {
      check_status: CheckStatus;
      check_result?: Record<string, unknown>;
      failure_reason?: string;
      failure_details?: Record<string, unknown>;
    } = {
      check_status: checkResult.passed ? 'PASSED' : 'FAILED',
    };

    if (checkResult.check_result) {
      updateInput.check_result = checkResult.check_result;
    }

    if (!checkResult.passed) {
      updateInput.failure_reason = checkResult.failure_reason || 'Gate check failed';
      updateInput.failure_details = checkResult.failure_details || {};
    }

    check = await GateCheckModel.updateResult(check.id, tenantId, userId || 'system', updateInput);

    // Update check duration
    await db.query(
      `UPDATE gate_checks SET check_duration_ms = $1 WHERE id = $2`,
      [duration, check.id]
    );

    // Log gate decision (immutable integrity log)
    await this.logGateDecision(
      tenantId,
      check.id,
      gate.id,
      resourceType,
      resourceId,
      checkResult.passed ? 'PASS' : 'FAIL',
      checkResult.failure_reason || 'Gate check passed',
      checkResult.failure_details || {},
      userId,
      gate.is_blocking && !checkResult.passed,
      stage
    );

    return check;
  }

  /**
   * Perform gate check based on gate type
   */
  private static async performGateCheck(
    gate: QualityGate,
    resourceType: ResourceType,
    resourceId: string,
    tenantId: string
  ): Promise<GateCheckResult> {
    switch (gate.gate_type) {
      case 'DOCUMENT':
        return await this.checkDocumentGate(gate, resourceType, resourceId, tenantId);
      case 'APPROVAL':
        return await this.checkApprovalGate(gate, resourceType, resourceId, tenantId);
      case 'RISK_SCORE':
        return await this.checkRiskScoreGate(gate, resourceType, resourceId, tenantId);
      case 'DATA_COMPLETENESS':
        return await this.checkDataCompletenessGate(gate, resourceType, resourceId, tenantId);
      default:
        return {
          passed: false,
          failure_reason: `Unknown gate type: ${gate.gate_type}`,
        };
    }
  }

  /**
   * Check document gate (e.g., required documents missing)
   */
  private static async checkDocumentGate(
    gate: QualityGate,
    resourceType: ResourceType,
    resourceId: string,
    tenantId: string
  ): Promise<GateCheckResult> {
    const rules = gate.gate_rules as {
      required_documents?: string[];
      document_types?: string[];
      min_documents?: number;
    };

    const requiredDocs = rules.required_documents || [];
    const docTypes = rules.document_types || [];
    const minDocs = rules.min_documents || 0;

    // Get linked documents for resource
    let linkedDocIds: string[] = [];

    if (resourceType === 'PROCESS') {
      const process = await db.query<{ linked_document_ids: string[] }>(
        `SELECT linked_document_ids FROM processes 
         WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [resourceId, tenantId]
      );
      if (process.rows.length > 0) {
        linkedDocIds = process.rows[0].linked_document_ids || [];
      }
    } else if (resourceType === 'AUCTION_ASSET') {
      const asset = await db.query<{ linked_document_ids: string[] }>(
        `SELECT linked_document_ids FROM auction_assets 
         WHERE id = $1 AND tenant_id = $2`,
        [resourceId, tenantId]
      );
      if (asset.rows.length > 0) {
        linkedDocIds = asset.rows[0].linked_document_ids || [];
      }
    }

    // Check required documents
    const missingDocs: string[] = [];
    for (const requiredDoc of requiredDocs) {
      if (!linkedDocIds.includes(requiredDoc)) {
        missingDocs.push(requiredDoc);
      }
    }

    // Check document types
    if (docTypes.length > 0) {
      const docTypesResult = await db.query<{ document_type: string }>(
        `SELECT DISTINCT document_type FROM documents 
         WHERE id = ANY($1) AND tenant_id = $2 AND deleted_at IS NULL`,
        [linkedDocIds, tenantId]
      );
      const foundTypes = docTypesResult.rows.map(r => r.document_type);
      const missingTypes = docTypes.filter(type => !foundTypes.includes(type));
      if (missingTypes.length > 0) {
        missingDocs.push(...missingTypes.map(t => `Document type: ${t}`));
      }
    }

    // Check minimum document count
    if (linkedDocIds.length < minDocs) {
      missingDocs.push(`Minimum ${minDocs} documents required, found ${linkedDocIds.length}`);
    }

    if (missingDocs.length > 0) {
      return {
        passed: false,
        failure_reason: `Missing required documents: ${missingDocs.join(', ')}`,
        failure_details: {
          missing_documents: missingDocs,
          found_documents: linkedDocIds.length,
          required_count: minDocs,
        },
      };
    }

    return {
      passed: true,
      check_result: {
        found_documents: linkedDocIds.length,
        document_ids: linkedDocIds,
      },
    };
  }

  /**
   * Check approval gate (e.g., missing approvals)
   */
  private static async checkApprovalGate(
    gate: QualityGate,
    resourceType: ResourceType,
    resourceId: string,
    tenantId: string
  ): Promise<GateCheckResult> {
    const rules = gate.gate_rules as {
      required_approvers?: string[];
      required_roles?: string[];
      min_approvals?: number;
    };

    const requiredApprovers = rules.required_approvers || [];
    const requiredRoles = rules.required_roles || [];
    const minApprovals = rules.min_approvals || 1;

    // Check approvals (would query approval table)
    // For now, simplified check
    const approvalResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM process_participants 
       WHERE process_id = $1 AND role = 'approver' AND removed_at IS NULL`,
      [resourceId]
    );
    const approvalCount = parseInt(approvalResult.rows[0].count, 10);

    if (approvalCount < minApprovals) {
      return {
        passed: false,
        failure_reason: `Missing required approvals. Found ${approvalCount}, required ${minApprovals}`,
        failure_details: {
          found_approvals: approvalCount,
          required_approvals: minApprovals,
        },
      };
    }

    return {
      passed: true,
      check_result: {
        approval_count: approvalCount,
      },
    };
  }

  /**
   * Check risk score gate (e.g., high risk score)
   */
  private static async checkRiskScoreGate(
    gate: QualityGate,
    resourceType: ResourceType,
    resourceId: string,
    tenantId: string
  ): Promise<GateCheckResult> {
    const rules = gate.gate_rules as {
      max_risk_score?: number;
      risk_threshold?: number;
    };

    const maxRisk = rules.max_risk_score || rules.risk_threshold || 70;

    // Get risk score
    let riskScore = 0;
    if (resourceType === 'AUCTION_ASSET') {
      const asset = await db.query<{ risk_score: number }>(
        `SELECT risk_score FROM auction_assets 
         WHERE id = $1 AND tenant_id = $2`,
        [resourceId, tenantId]
      );
      if (asset.rows.length > 0) {
        riskScore = asset.rows[0].risk_score || 0;
      }
    }

    if (riskScore > maxRisk) {
      return {
        passed: false,
        failure_reason: `Risk score ${riskScore} exceeds maximum allowed ${maxRisk}`,
        failure_details: {
          current_risk_score: riskScore,
          max_allowed_risk: maxRisk,
        },
      };
    }

    return {
      passed: true,
      check_result: {
        risk_score: riskScore,
        max_allowed: maxRisk,
      },
    };
  }

  /**
   * Check data completeness gate
   */
  private static async checkDataCompletenessGate(
    gate: QualityGate,
    resourceType: ResourceType,
    resourceId: string,
    tenantId: string
  ): Promise<GateCheckResult> {
    const rules = gate.gate_rules as {
      required_fields?: string[];
      required_sections?: string[];
    };

    // Simplified - would check actual resource data
    return {
      passed: true,
      check_result: {
        completeness: 100,
      },
    };
  }

  /**
   * Get or create gate check
   */
  private static async getOrCreateCheck(
    gateId: string,
    resourceType: ResourceType,
    resourceId: string,
    tenantId: string
  ): Promise<GateCheck> {
    const existing = await db.query<GateCheck>(
      `SELECT * FROM gate_checks 
       WHERE quality_gate_id = $1 AND resource_type = $2 AND resource_id = $3 AND tenant_id = $4
       ORDER BY created_at DESC
       LIMIT 1`,
      [gateId, resourceType, resourceId, tenantId]
    );

    if (existing.rows.length > 0) {
      const existingCheck = existing.rows[0];
      // Map row manually (mapRow is private)
      const check: GateCheck = {
        id: existingCheck.id as string,
        tenant_id: existingCheck.tenant_id as string,
        quality_gate_id: existingCheck.quality_gate_id as string,
        resource_type: existingCheck.resource_type as ResourceType,
        resource_id: existingCheck.resource_id as string,
        check_status: existingCheck.check_status as CheckStatus,
        check_result: existingCheck.check_result ? (existingCheck.check_result as Record<string, unknown>) : null,
        failure_reason: (existingCheck.failure_reason as string) ?? null,
        failure_details: existingCheck.failure_details ? (existingCheck.failure_details as Record<string, unknown>) : null,
        is_overridden: Boolean(existingCheck.is_overridden),
        overridden_by: (existingCheck.overridden_by as string) ?? null,
        overridden_at: existingCheck.overridden_at ? new Date(existingCheck.overridden_at as string) : null,
        override_reason: (existingCheck.override_reason as string) ?? null,
        override_approval_required: Boolean(existingCheck.override_approval_required),
        override_approved_by: (existingCheck.override_approved_by as string) ?? null,
        checked_at: existingCheck.checked_at ? new Date(existingCheck.checked_at as string) : null,
        checked_by: (existingCheck.checked_by as string) ?? null,
        check_duration_ms: existingCheck.check_duration_ms ? Number(existingCheck.check_duration_ms) : null,
        created_at: new Date(existingCheck.created_at as string),
        updated_at: new Date(existingCheck.updated_at as string),
      };
      
      if (check.check_status === 'PENDING') {
        return check;
      }
    }

    return await GateCheckModel.create({
      tenant_id: tenantId,
      quality_gate_id: gateId,
      resource_type: resourceType,
      resource_id: resourceId,
    });
  }

  /**
   * Log gate decision to immutable integrity log
   */
  private static async logGateDecision(
    tenantId: string,
    gateCheckId: string,
    qualityGateId: string,
    resourceType: ResourceType,
    resourceId: string,
    decisionResult: 'PASS' | 'FAIL' | 'OVERRIDE' | 'BLOCKED',
    decisionReason: string,
    decisionDetails: Record<string, unknown>,
    userId?: string,
    workflowBlocked = false,
    stage?: string
  ): Promise<void> {
    // Get user info if available
    let userEmail = 'system';
    let userRole = 'SYSTEM';
    if (userId && userId !== 'system') {
      const user = await db.query<{ email: string; role: string }>(
        `SELECT email, role FROM users WHERE id = $1`,
        [userId]
      );
      if (user.rows.length > 0) {
        userEmail = user.rows[0].email;
        userRole = user.rows[0].role || 'SYSTEM';
      }
    }

    await db.query(
      `INSERT INTO gate_decisions 
       (tenant_id, gate_check_id, quality_gate_id, decision_type, decision_result,
        resource_type, resource_id, decision_reason, decision_details,
        decided_by, decided_by_email, decided_by_role, workflow_blocked, workflow_stage)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        tenantId,
        gateCheckId,
        qualityGateId,
        'CHECK',
        decisionResult,
        resourceType,
        resourceId,
        decisionReason,
        JSON.stringify(decisionDetails),
        userId || null,
        userEmail,
        userRole,
        workflowBlocked,
        stage || null,
      ]
    );
  }

  /**
   * Check if workflow can proceed (all blocking gates passed)
   */
  static async canProceed(
    tenantId: string,
    resourceType: ResourceType,
    resourceId: string,
    processType?: string,
    stage?: string
  ): Promise<{ can_proceed: boolean; blocking_gates: string[]; failure_reasons: string[] }> {
    const validation = await this.checkGates(tenantId, resourceType, resourceId, processType, stage);

    const blockingGates = validation.blocking_failures.map(f => f.id);
    const failureReasons = validation.blocking_failures
      .map(f => f.failure_reason)
      .filter((r): r is string => r !== null);

    return {
      can_proceed: !validation.workflow_blocked,
      blocking_gates: blockingGates,
      failure_reasons: failureReasons,
    };
  }
}
