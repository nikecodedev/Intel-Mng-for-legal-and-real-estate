import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, authenticate, requirePermission } from '../middleware';
import { getTenantContext } from '../utils/tenant-context';
import { NotFoundError, ValidationError } from '../utils/errors';
import { InvestorMatchingService } from '../services/investor-matching';
import { KYCDataModel } from '../models/kyc-data';
import { AuditService, AuditAction, AuditEventCategory } from '../services/audit';
import { logger } from '../utils/logger';
import { db } from '../models/database';

const router = Router();

// ============================================
// Matching Engine Routes
// ============================================

/**
 * POST /matching/find-matches/:investor_id
 * Find matches for an investor (requires approved KYC)
 */
router.post(
  '/find-matches/:investor_id',
  authenticate,
  requirePermission('matching:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { investor_id } = req.params;
    const userId = req.user!.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    // Verify KYC approval
    const hasApprovedKYC = await KYCDataModel.hasApprovedKYC(investor_id, tenantContext.tenantId);
    if (!hasApprovedKYC) {
      throw new NotFoundError('Investor must have approved KYC to access matching');
    }

    // Find matches
    const matches = await InvestorMatchingService.findMatchesForInvestor(
      investor_id,
      tenantContext.tenantId,
      limit
    );

    // Audit match search
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.READ,
      eventType: 'matching.find_matches',
      eventCategory: AuditEventCategory.DATA_ACCESS,
      resourceType: 'match_record',
      description: `Found ${matches.length} matches for investor ${investor_id}`,
      details: {
        investor_id,
        match_count: matches.length,
        top_scores: matches.slice(0, 5).map(m => ({
          asset_id: m.auction_asset_id,
          score: m.match_score,
        })),
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      matches,
      count: matches.length,
    });
  })
);

/**
 * POST /matching/auto-notify/:investor_id
 * Check and auto-notify investor for high-scoring matches
 */
router.post(
  '/auto-notify/:investor_id',
  authenticate,
  requirePermission('matching:update'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { investor_id } = req.params;
    const userId = req.user!.id;

    // Verify KYC approval
    const hasApprovedKYC = await KYCDataModel.hasApprovedKYC(investor_id, tenantContext.tenantId);
    if (!hasApprovedKYC) {
      throw new NotFoundError('Investor must have approved KYC to receive match notifications');
    }

    // Check and notify
    const result = await InvestorMatchingService.checkAndAutoNotify(
      tenantContext.tenantId,
      investor_id
    );

    // Audit auto-notification
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.UPDATE,
      eventType: 'matching.auto_notify',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'match_record',
      description: `Auto-notified investor ${investor_id} for ${result.notified} high-scoring matches`,
      details: {
        investor_id,
        notified_count: result.notified,
        matches: result.matches.map(m => ({
          match_id: m.id,
          asset_id: m.auction_asset_id,
          score: m.match_score,
        })),
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      notified: result.notified,
      matches: result.matches,
    });
  })
);

/**
 * GET /matching/matches/:investor_id
 * Get match records for an investor
 */
router.get(
  '/matches/:investor_id',
  authenticate,
  requirePermission('matching:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { investor_id } = req.params;
    const min_score = req.query.min_score ? parseInt(req.query.min_score as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const conditions: string[] = ['tenant_id = $1', 'investor_user_id = $2'];
    const values: unknown[] = [tenantContext.tenantId, investor_id];
    let paramCount = 3;

    if (min_score !== undefined) {
      conditions.push(`match_score >= $${paramCount++}`);
      values.push(min_score);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM match_records WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    values.push(limit, offset);

    const result = await db.query(
      `SELECT * FROM match_records 
       WHERE ${whereClause}
       ORDER BY match_score DESC, created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      values
    );

    res.json({
      success: true,
      matches: result.rows,
      total,
      limit,
      offset,
    });
  })
);

/**
 * GET /matching/matches/:match_id
 * Get single match record
 */
router.get(
  '/matches/:match_id',
  authenticate,
  requirePermission('matching:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { match_id } = req.params;

    const result = await db.query(
      `SELECT * FROM match_records 
       WHERE id = $1 AND tenant_id = $2`,
      [match_id, tenantContext.tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Match record');
    }

    res.json({
      success: true,
      match: result.rows[0],
    });
  })
);

/**
 * PUT /matching/matches/:match_id/interest
 * Update investor interest level for a match
 */
router.put(
  '/matches/:match_id/interest',
  authenticate,
  requirePermission('matching:update'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantContext = getTenantContext(req);
    const { match_id } = req.params;
    const userId = req.user!.id;
    const { interest_level, feedback } = req.body;

    if (!interest_level || !['HIGH', 'MEDIUM', 'LOW', 'NONE'].includes(interest_level)) {
      throw new ValidationError('Invalid interest_level. Must be HIGH, MEDIUM, LOW, or NONE');
    }

    const result = await db.query(
      `UPDATE match_records 
       SET investor_interest_level = $1,
           investor_feedback = $2,
           investor_viewed_at = CURRENT_TIMESTAMP,
           match_status = CASE 
             WHEN $1 = 'NONE' THEN 'NOT_INTERESTED'
             WHEN $1 IN ('HIGH', 'MEDIUM') THEN 'INTERESTED'
             ELSE match_status
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [interest_level, feedback || null, match_id, tenantContext.tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Match record');
    }

    // Audit interest update
    await AuditService.log({
      tenantId: tenantContext.tenantId,
      userId,
      userEmail: req.user!.email,
      userRole: tenantContext.role,
      action: AuditAction.UPDATE,
      eventType: 'matching.interest_update',
      eventCategory: AuditEventCategory.DATA_MODIFICATION,
      resourceType: 'match_record',
      resourceId: match_id,
      description: `Investor interest updated to ${interest_level}`,
      details: {
        match_id,
        interest_level,
        feedback,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    res.json({
      success: true,
      match: result.rows[0],
    });
  })
);

export default router;
