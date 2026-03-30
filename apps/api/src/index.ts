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
