import { Router } from 'express';
import { asyncHandler, authenticate, requirePermission } from '../middleware/index.js';
import { db } from '../database/connection.js';
import { getTenantContext } from '../middleware/tenant.js';

const router = Router();

/**
 * GET /admin/overrides
 * List override events for the current tenant (audit trail)
 */
router.get(
  '/overrides',
  authenticate,
  requirePermission('audit:read'),
  asyncHandler(async (req, res) => {
    const tenantContext = getTenantContext(req);

    const result = await db.query<{
      id: string;
      user_id: string;
      user_email: string;
      override_type: string;
      target_entity: string;
      target_id: string;
      otp_verified: boolean;
      reason: string | null;
      justification: string | null;
      metadata: Record<string, unknown>;
      created_at: string;
    }>(
      `SELECT
         oe.id,
         oe.user_id,
         COALESCE(u.email, oe.user_id::text) AS user_email,
         oe.override_type,
         oe.target_entity,
         oe.target_id,
         COALESCE(oe.otp_verified, false) AS otp_verified,
         oe.reason,
         oe.justification,
         COALESCE(oe.metadata, '{}') AS metadata,
         oe.created_at
       FROM override_events oe
       LEFT JOIN users u ON u.id = oe.user_id
       WHERE oe.tenant_id = $1
       ORDER BY oe.created_at DESC
       LIMIT 200`,
      [tenantContext.tenantId]
    );

    res.json({
      success: true,
      data: {
        events: result.rows,
        total: result.rowCount,
      },
    });
  })
);

export default router;
