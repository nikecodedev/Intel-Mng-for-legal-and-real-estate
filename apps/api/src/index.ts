/**
 * Application entry point
 * Initializes and starts the Express server
 */
import { startServer } from './app.js';
import { logger } from './utils/logger.js';
import { initializeJobProcessors } from './services/job-processors.js';
import { JobQueueService } from './services/job-queue.js';
import { db } from './models/database.js';

// Initialize job queue
JobQueueService.initialize();

// Initialize job processors
initializeJobProcessors();

// Start the server
try {
  startServer();
} catch (error) {
  logger.error('Failed to start server', { error });
  process.exit(1);
}

/**
 * HG-7: Auto-wipe Zero Footprint
 * Runs every hour to delete expired expense receipt files.
 * Uses a database function (execute_auto_wipe) so it survives server restarts —
 * missed wipes are caught on the next cycle since the TTL is stored in the DB.
 */
const AUTO_WIPE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function runAutoWipe(): Promise<void> {
  try {
    const result = await db.query<{ execute_auto_wipe: number }>(
      'SELECT execute_auto_wipe()'
    );
    const wiped = result.rows[0]?.execute_auto_wipe ?? 0;
    if (wiped > 0) {
      logger.info('Auto-wipe completed', { wiped_documents: wiped });
    }
  } catch (error) {
    // Log but don't crash — the function may not exist yet if migration hasn't run
    logger.warn('Auto-wipe cycle failed (migration may not be applied yet)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Run once shortly after startup (30s delay to let DB initialize), then every hour
setTimeout(() => {
  runAutoWipe();
  setInterval(runAutoWipe, AUTO_WIPE_INTERVAL_MS);
}, 30_000);

/**
 * KYC Expiry Scanner
 * Runs every 6 hours. Finds KYC records expiring in ≤ 30 days and dispatches
 * kyc.expiry.warning workflow events for each one (idempotent via workflow engine).
 */
const KYC_SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function scanKycExpiryAlerts(): Promise<void> {
  try {
    const result = await db.query<{
      id: string;
      investor_user_id: string;
      tenant_id: string;
      kyc_expires_at: string;
    }>(
      `SELECT id, investor_user_id, tenant_id, kyc_expires_at
       FROM kyc_data
       WHERE kyc_expires_at IS NOT NULL
         AND kyc_expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days'
         AND kyc_status NOT IN ('EXPIRED', 'REVOKED')
         AND deleted_at IS NULL`
    );

    if (result.rows.length === 0) return;

    const { runWorkflow } = await import('./services/workflow-engine.js');
    for (const row of result.rows) {
      const daysRemaining = Math.floor(
        (new Date(row.kyc_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      try {
        await runWorkflow({
          tenantId: row.tenant_id,
          eventType: 'kyc.expiry.warning',
          payload: {
            kyc_id: row.id,
            investor_user_id: row.investor_user_id,
            days_remaining: daysRemaining,
            expires_at: row.kyc_expires_at,
            source: 'background_scanner',
          },
          userId: 'system',
          userEmail: 'system@platform',
          userRole: 'SYSTEM',
        });
        logger.info('KYC expiry alert dispatched by scanner', {
          kyc_id: row.id,
          days_remaining: daysRemaining,
        });
      } catch (wfErr) {
        logger.warn('KYC expiry workflow dispatch failed', { kyc_id: row.id, error: wfErr });
      }
    }

    logger.info('KYC expiry scan complete', { checked: result.rows.length });
  } catch (error) {
    logger.warn('KYC expiry scan failed (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Start KYC scanner: 60s after boot, then every 6 hours
setTimeout(() => {
  scanKycExpiryAlerts();
  setInterval(scanKycExpiryAlerts, KYC_SCAN_INTERVAL_MS);
}, 60_000);
