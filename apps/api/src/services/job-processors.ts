/**
 * Background Job Processors
 * Handles processing of queued jobs with retry mechanism
 */

import { JobQueueService, JobData, JobResult } from './job-queue.js';
import { documentExtractionService } from './document-extraction.js';
import { runWorkflow, WorkflowEventContext } from './workflow-engine.js';
import { logger } from '../utils/logger.js';

/**
 * Initialize all job processors
 * Should be called during application startup
 */
export function initializeJobProcessors(): void {
  // Document processing queue
  JobQueueService.processQueue<{
    tenantId: string;
    documentId: string;
    filePath: string;
    userId: string;
  }>('document-processing', async (job) => {
    const { tenantId, documentId, filePath, userId } = job.data;

    logger.info('Processing document job', {
      jobId: job.id,
      documentId,
      tenantId,
      attempt: job.attemptsMade + 1,
    });

    try {
      const result = await documentExtractionService.processDocument(
        tenantId,
        documentId,
        filePath,
        userId
      );

      if (result.success) {
        return {
          success: true,
          data: {
            documentId: result.document_id,
            extractionId: result.extraction_id,
            statusCpo: result.status_cpo,
          },
        };
      } else {
        throw new Error(`Document processing failed: ${result.errors.join(', ')}`);
      }
    } catch (error) {
      logger.error('Document processing job failed', {
        jobId: job.id,
        documentId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
        attempt: job.attemptsMade + 1,
      });
      throw error; // Will trigger retry if attempts remaining
    }
  });

  // Workflow triggers queue
  JobQueueService.processQueue<{
    tenantId: string;
    eventType: string;
    payload: Record<string, unknown>;
    userId?: string;
    userEmail?: string;
    userRole?: string;
  }>('workflow-triggers', async (job) => {
    const { tenantId, eventType, payload, userId, userEmail, userRole } = job.data;

    logger.info('Processing workflow trigger job', {
      jobId: job.id,
      eventType,
      tenantId,
      attempt: job.attemptsMade + 1,
    });

    try {
      const context: WorkflowEventContext = {
        tenantId,
        eventType,
        payload,
        userId,
        userEmail,
        userRole,
      };

      const result = await runWorkflow(context);

      return {
        success: true,
        data: {
          allowed: result.allowed,
          blockMessage: result.blockMessage,
          triggered: result.triggered,
        },
      };
    } catch (error) {
      logger.error('Workflow trigger job failed', {
        jobId: job.id,
        eventType,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
        attempt: job.attemptsMade + 1,
      });
      throw error; // Will trigger retry if attempts remaining
    }
  });

  logger.info('Job processors initialized', {
    queues: ['document-processing', 'workflow-triggers'],
  });
}
