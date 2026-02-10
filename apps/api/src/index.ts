/**
 * Application entry point
 * Initializes and starts the Express server
 */
import { startServer } from './app.js';
import { logger } from './utils/logger.js';

// Start the server
try {
  startServer();
} catch (error) {
  logger.error('Failed to start server', { error });
  process.exit(1);
}
