import { Router, Request, Response } from 'express';
import { asyncHandler, authenticate, requirePermission } from '../middleware/index.js';
import { MonitoringService } from '../services/monitoring.js';

const router = Router();

/**
 * GET /metrics
 * Get application metrics (requires authentication)
 */
router.get(
  '/',
  authenticate,
  requirePermission('metrics:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const metrics = await MonitoringService.getMetrics();

    res.json({
      success: true,
      metrics,
    });
  })
);

export default router;
