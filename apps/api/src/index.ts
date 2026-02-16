/**
 * Application entry point
 * Initializes and starts the Express server
 */
import { startServer } from './app.js';
import { logger } from './utils/logger.js';
import { initializeJobProcessors } from './services/job-processors.js';
import { JobQueueService } from './services/job-queue.js';

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
