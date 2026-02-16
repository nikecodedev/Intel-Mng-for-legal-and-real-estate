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
  const hashInput = `${previousHash || ''}|${JSON.stringify(payloadEvento)}|${createdAt.toISOString()}`;
  return createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Verify hash chain for a tenant
 */
async function verifyTenantHashChain(tenantId: string): Promise<IntegrityVerificationResult> {
  // Get all audit logs for tenant, ordered by creation time
  const result = await db.query<AuditLogEntry>(
    `SELECT 
      id,
      tenant_id,
      previous_hash,
      current_hash,
      payload_evento,
      created_at
    FROM audit_logs
    WHERE tenant_id = $1
    ORDER BY created_at ASC, id ASC`,
    [tenantId]
  );

  const entries = result.rows;
  const issues: HashChainVerification[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let previousHash: string | null = null;

  // Calculate genesis hash
  const genesisHash = createHash('sha256').update('GENESIS').digest('hex');

  for (const entry of entries) {
    const verification: HashChainVerification = {
      entry_id: entry.id,
      entry_timestamp: entry.created_at.toISOString(),
      previous_hash: entry.previous_hash,
      calculated_hash: '',
      stored_hash: entry.current_hash,
      is_valid: false,
    };

    // Determine expected previous hash
    const expectedPreviousHash = previousHash || genesisHash;

    // Verify previous hash matches
    if (entry.previous_hash !== expectedPreviousHash) {
      verification.is_valid = false;
      verification.error = `Previous hash mismatch. Expected: ${expectedPreviousHash}, Got: ${entry.previous_hash}`;
      invalidCount++;
      issues.push(verification);
      // Continue verification with the stored previous_hash to check subsequent entries
      previousHash = entry.current_hash;
      continue;
    }

    // Calculate current hash
    const calculatedHash = calculateHash(
      entry.previous_hash,
      entry.payload_evento as Record<string, unknown>,
      entry.created_at
    );

    verification.calculated_hash = calculatedHash;

    // Verify calculated hash matches stored hash
    if (calculatedHash !== entry.current_hash) {
      verification.is_valid = false;
      verification.error = `Hash mismatch. Calculated: ${calculatedHash}, Stored: ${entry.current_hash}`;
      invalidCount++;
      issues.push(verification);
    } else {
      verification.is_valid = true;
      validCount++;
    }

    previousHash = entry.current_hash;
  }

  // Determine chain integrity status
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
    total_entries: entries.length,
    valid_entries: validCount,
    invalid_entries: invalidCount,
    chain_integrity: chainIntegrity,
    issues,
    genesis_hash: genesisHash,
    latest_hash: previousHash || genesisHash,
  };
}

/**
 * GET /audit-integrity/verify
 * Verify audit log hash chain integrity for current tenant
 * Requires: audit:read permission
 */
router.get(
  '/verify',
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
 * GET /audit-integrity/verify/:tenant_id
 * Verify audit log hash chain integrity for specific tenant (super admin only)
 * Requires: super_admin permission
 */
router.get(
  '/verify/:tenant_id',
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
        COUNT(*) as total_entries,
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

export default router;
