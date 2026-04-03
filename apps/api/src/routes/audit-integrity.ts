import { Router, Request, Response } from 'express';
import { asyncHandler, authenticate, requirePermission } from '../middleware/index.js';
import { getTenantContext } from '../utils/tenant-context.js';
import { db } from '../models/database.js';
import { logger } from '../utils/logger.js';
import { createHash } from 'crypto';

const router = Router();

/**
 * Audit log entry for integrity verification
 */
interface AuditLogEntry {
  id: string;
  tenant_id: string;
  previous_hash: string;
  current_hash: string;
  payload_evento: Record<string, unknown>;
  created_at: Date;
}

/**
 * Hash chain verification result
 */
interface HashChainVerification {
  entry_id: string;
  entry_timestamp: string;
  previous_hash: string;
  calculated_hash: string;
  stored_hash: string;
  is_valid: boolean;
  error?: string;
}

/**
 * Audit integrity verification result
 */
interface IntegrityVerificationResult {
  tenant_id: string;
  verified_at: string;
  total_entries: number;
  valid_entries: number;
  invalid_entries: number;
  chain_integrity: 'valid' | 'invalid' | 'partial';
  issues: HashChainVerification[];
  genesis_hash: string;
  latest_hash: string;
}

/**
 * Calculate hash for audit log entry
 * Matches the database function calculate_audit_log_hash
 */
function calculateHash(
  previousHash: string,
  payloadEvento: Record<string, unknown>,
  createdAt: Date
): string {
  // Must match DB trigger: sha256(prev_hash || payload_evento::text || created_at::text)
  // PostgreSQL ::text for jsonb uses no spaces, and timestamptz includes +00
  const pgPayload = JSON.stringify(payloadEvento);
  const pgTimestamp = createdAt.toISOString().replace('T', ' ').replace('Z', '+00');
  const hashInput = `${previousHash || ''}${pgPayload}${pgTimestamp}`;
  return createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Verify hash chain for a tenant using the DB function.
 * This ensures the exact same hash formula is used for both INSERT and verification
 * (PostgreSQL ::text cast for jsonb and timestamptz).
 */
async function verifyTenantHashChain(tenantId: string): Promise<IntegrityVerificationResult> {
  interface DbValidationRow {
    hash_chain_index: number;
    record_id: string;
    created_at: Date;
    current_hash: string;
    previous_hash: string;
    calculated_hash: string;
    is_valid: boolean;
  }

  const result = await db.query<DbValidationRow>(
    `SELECT * FROM validate_audit_hash_chain($1)`,
    [tenantId]
  );

  const rows = result.rows;
  const issues: HashChainVerification[] = [];
  let validCount = 0;
  let invalidCount = 0;

  for (const row of rows) {
    if (row.is_valid) {
      validCount++;
    } else {
      invalidCount++;
      issues.push({
        entry_id: row.record_id,
        entry_timestamp: row.created_at.toISOString(),
        previous_hash: row.previous_hash,
        calculated_hash: row.calculated_hash,
        stored_hash: row.current_hash,
        is_valid: false,
        error: `Hash mismatch. Calculated: ${row.calculated_hash}, Stored: ${row.current_hash}`,
      });
    }
  }

  const genesisHash = createHash('sha256').update('GENESIS').digest('hex');
  const lastRow = rows[rows.length - 1];

  let chainIntegrity: 'valid' | 'invalid' | 'partial';
  if (invalidCount === 0) {
    chainIntegrity = 'valid';
  } else if (validCount === 0) {
    chainIntegrity = 'invalid';
  } else {
    chainIntegrity = 'partial';
  }

  return {
    tenant_id: tenantId,
    verified_at: new Date().toISOString(),
    total_entries: rows.length,
    valid_entries: validCount,
    invalid_entries: invalidCount,
    chain_integrity: chainIntegrity,
    issues,
    genesis_hash: genesisHash,
    latest_hash: lastRow?.current_hash || genesisHash,
  };
}

/**
 * GET /audit-integrity/verify-chain
 * Verify audit log hash chain integrity for current tenant
 * Requires: audit:read permission
 */
router.get(
  '/verify-chain',
  authenticate,
  requirePermission('audit:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getTenantContext(req);

    logger.info('Audit integrity verification requested', { tenantId });

    const verification = await verifyTenantHashChain(tenantId);

    const statusCode = verification.chain_integrity === 'valid' ? 200 : 422;

    res.status(statusCode).json({
      success: verification.chain_integrity === 'valid',
      data: verification,
    });
  })
);

/**
 * GET /audit-integrity/verify-chain/:tenant_id
 * Verify audit log hash chain integrity for specific tenant (super admin only)
 * Requires: super_admin permission
 */
router.get(
  '/verify-chain/:tenant_id',
  authenticate,
  requirePermission('super_admin:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenant_id } = req.params;

    // Validate tenant_id format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenant_id)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TENANT_ID',
          message: 'Invalid tenant ID format',
        },
      });
      return;
    }

    logger.info('Audit integrity verification requested (super admin)', { tenant_id });

    const verification = await verifyTenantHashChain(tenant_id);

    const statusCode = verification.chain_integrity === 'valid' ? 200 : 422;

    res.status(statusCode).json({
      success: verification.chain_integrity === 'valid',
      data: verification,
    });
  })
);

/**
 * GET /audit-integrity/status
 * Get quick status of audit integrity for current tenant
 * Requires: audit:read permission
 */
router.get(
  '/status',
  authenticate,
  requirePermission('audit:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getTenantContext(req);

    // Quick check: verify latest hash only
    const result = await db.query<{
      total_entries: number;
      latest_hash: string;
      latest_previous_hash: string;
      latest_payload: Record<string, unknown>;
      latest_created_at: Date;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = $1) as total_entries,
        current_hash as latest_hash,
        previous_hash as latest_previous_hash,
        payload_evento as latest_payload,
        created_at as latest_created_at
      FROM audit_logs
      WHERE tenant_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
      [tenantId]
    );

    if (result.rows.length === 0) {
      res.json({
        success: true,
        data: {
          tenant_id: tenantId,
          status: 'no_entries',
          message: 'No audit logs found for this tenant',
        },
      });
      return;
    }

    const latest = result.rows[0];
    const calculatedHash = calculateHash(
      latest.latest_previous_hash,
      latest.latest_payload as Record<string, unknown>,
      latest.latest_created_at
    );

    const is_valid = calculatedHash === latest.latest_hash;

    res.json({
      success: is_valid,
      data: {
        tenant_id: tenantId,
        status: is_valid ? 'valid' : 'invalid',
        total_entries: parseInt(latest.total_entries as unknown as string, 10),
        latest_hash_valid: is_valid,
        checked_at: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /audit-integrity/violations
 * List proactive hash chain violations detected at INSERT time
 */
router.get(
  '/violations',
  authenticate,
  requirePermission('audit:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getTenantContext(req);
    const result = await db.query<{
      id: string;
      violation_type: string;
      severity: string;
      details: Record<string, unknown>;
      detected_at: Date;
      resolved_at: Date | null;
    }>(
      `SELECT id, violation_type, severity, details, detected_at, resolved_at
       FROM compliance_violations
       WHERE tenant_id = $1
       ORDER BY detected_at DESC
       LIMIT 100`,
      [tenantId]
    );

    res.json({
      success: true,
      data: {
        violations: result.rows,
        total: result.rows.length,
        has_unresolved: result.rows.some(r => r.resolved_at === null),
      },
    });
  })
);

export default router;
