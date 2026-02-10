import { Router, Request, Response } from 'express';
import { asyncHandler, authenticate, requirePermission, validateRequest } from '../middleware/index.js';
import { DistributedLockService } from '../services/distributed-lock.js';
import { z } from 'zod';
import { ConflictError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * Example: Process Locking
 * Demonstrates distributed locks to prevent concurrent edits
 */

// ============================================
// Schema definitions
// ============================================

const updateProcessSchema = z.object({
  body: z.object({
    title: z.string().optional(),
    status: z.string().optional(),
    description: z.string().optional(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

// ============================================
// Lock acquisition example
// ============================================

/**
 * POST /processes/:id/lock
 * Acquire a lock on a process to prevent concurrent edits
 */
router.post(
  '/:id/lock',
  authenticate,
  requirePermission('processes:update'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const resource = `process:${id}`;
    const ttl = 300; // 5 minutes

    // Try to acquire lock
    const lockToken = await DistributedLockService.acquireLock(resource, ttl, 3, 200);

    if (!lockToken) {
      // Check if lock exists and get TTL
      const isLocked = await DistributedLockService.isLocked(resource);
      const lockTTL = await DistributedLockService.getLockTTL(resource);

      throw new ConflictError(
        `Process is currently being edited by another user. Lock expires in ${lockTTL} seconds.`
      );
    }

    logger.info('Process lock acquired', {
      processId: id,
      userId: req.user?.id,
      lockToken,
      ttl,
    });

    res.json({
      success: true,
      data: {
        lockToken,
        expiresIn: ttl,
        message: 'Lock acquired. You have exclusive access to edit this process.',
      },
    });
  })
);

// ============================================
// Lock release example
// ============================================

/**
 * DELETE /processes/:id/lock
 * Release a lock on a process
 */
router.delete(
  '/:id/lock',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const resource = `process:${id}`;
    const lockToken = req.headers['x-lock-token'] as string;

    if (!lockToken) {
      throw new Error('Lock token required in X-Lock-Token header');
    }

    const released = await DistributedLockService.releaseLock(resource, lockToken);

    if (!released) {
      throw new ConflictError('Failed to release lock. Token may be invalid or lock may have expired.');
    }

    logger.info('Process lock released', {
      processId: id,
      userId: req.user?.id,
      lockToken,
    });

    res.json({
      success: true,
      message: 'Lock released successfully',
    });
  })
);

// ============================================
// Update with lock protection
// ============================================

/**
 * PUT /processes/:id
 * Update process with lock protection
 * Requires lock token in header
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('processes:update'),
  validateRequest(updateProcessSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { title, status, description } = req.body;
    const lockToken = req.headers['x-lock-token'] as string;
    const resource = `process:${id}`;

    if (!lockToken) {
      throw new Error('Lock token required in X-Lock-Token header');
    }

    // Verify lock exists and token matches
    const isLocked = await DistributedLockService.isLocked(resource);
    if (!isLocked) {
      throw new ConflictError('No active lock found. Please acquire a lock before editing.');
    }

    // In a real implementation, you would verify the token matches
    // For this example, we'll use withLock to ensure atomicity

    // Use withLock to ensure we have the lock during the update
    const result = await DistributedLockService.withLock(
      resource,
      async () => {
        // Check if lock token matches (in production, store token in lock value)
        // For now, we'll proceed with the update

        // Simulate database update
        // In real implementation:
        // const process = await ProcessModel.findById(id);
        // if (!process) throw new NotFoundError('Process');
        // await ProcessModel.update(id, { title, status, description });

        logger.info('Process updated with lock protection', {
          processId: id,
          userId: req.user?.id,
          updates: { title, status, description },
        });

        return {
          id,
          title: title || 'Updated Process',
          status: status || 'in_progress',
          description: description || 'Updated description',
          updated_at: new Date().toISOString(),
        };
      },
      300, // 5 minutes
      0 // No retries - lock should already be held
    );

    res.json({
      success: true,
      data: result,
      message: 'Process updated successfully',
    });
  })
);

// ============================================
// Update with automatic lock acquisition
// ============================================

/**
 * PATCH /processes/:id/quick-update
 * Quick update with automatic lock acquisition and release
 * Uses withLock helper for automatic lock management
 */
router.patch(
  '/:id/quick-update',
  authenticate,
  requirePermission('processes:update'),
  validateRequest(updateProcessSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body;
    const resource = `process:${id}`;
    const lockTTL = 60; // 1 minute for quick updates

    // Use withLock to automatically acquire, use, and release lock
    const result = await DistributedLockService.withLock(
      resource,
      async () => {
        // Simulate database update
        // In real implementation:
        // const process = await ProcessModel.findById(id);
        // if (!process) throw new NotFoundError('Process');
        // await ProcessModel.update(id, updates);

        logger.info('Process quick-updated with automatic lock', {
          processId: id,
          userId: req.user?.id,
          updates,
        });

        return {
          id,
          ...updates,
          updated_at: new Date().toISOString(),
        };
      },
      lockTTL,
      3 // Retry 3 times if lock is busy
    );

    res.json({
      success: true,
      data: result,
      message: 'Process updated successfully',
    });
  })
);

// ============================================
// Lock status check
// ============================================

/**
 * GET /processes/:id/lock/status
 * Check lock status for a process
 */
router.get(
  '/:id/lock/status',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const resource = `process:${id}`;

    const isLocked = await DistributedLockService.isLocked(resource);
    const ttl = await DistributedLockService.getLockTTL(resource);

    res.json({
      success: true,
      data: {
        isLocked,
        ttl: ttl > 0 ? ttl : null,
        expiresIn: ttl > 0 ? `${ttl} seconds` : null,
      },
    });
  })
);

// ============================================
// Lock extension example
// ============================================

/**
 * POST /processes/:id/lock/extend
 * Extend lock TTL
 */
router.post(
  '/:id/lock/extend',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const resource = `process:${id}`;
    const lockToken = req.headers['x-lock-token'] as string;
    const { ttl = 300 } = req.body; // Default 5 minutes

    if (!lockToken) {
      throw new Error('Lock token required in X-Lock-Token header');
    }

    const extended = await DistributedLockService.extendLock(resource, lockToken, ttl);

    if (!extended) {
      throw new ConflictError('Failed to extend lock. Token may be invalid or lock may have expired.');
    }

    logger.info('Process lock extended', {
      processId: id,
      userId: req.user?.id,
      lockToken,
      ttl,
    });

    res.json({
      success: true,
      data: {
        ttl,
        expiresIn: `${ttl} seconds`,
        message: 'Lock extended successfully',
      },
    });
  })
);

export default router;


