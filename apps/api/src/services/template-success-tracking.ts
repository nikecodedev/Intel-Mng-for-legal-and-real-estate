import { db } from '../models/database.js';
import { DocumentTemplateModel, DocumentTemplate } from '../models/document-template.js';
import { logger } from '../utils/logger.js';

export interface TemplateSuccessMetrics {
  template_id: string;
  template_name: string;
  usage_count: number;
  success_count: number;
  failure_count: number;
  success_rate: number | null;
  priority_score: number;
  is_recommended: boolean;
  last_used_at: Date | null;
}

/**
 * Template Success Tracking Service
 * Tracks and prioritizes templates based on success rates
 */
export class TemplateSuccessTrackingService {
  /**
   * Get template success metrics
   */
  static async getTemplateMetrics(
    templateId: string,
    tenantId: string
  ): Promise<TemplateSuccessMetrics | null> {
    const template = await DocumentTemplateModel.findById(templateId, tenantId);
    if (!template) {
      return null;
    }

    return {
      template_id: template.id,
      template_name: template.template_name,
      usage_count: template.usage_count,
      success_count: template.success_count,
      failure_count: template.failure_count,
      success_rate: template.success_rate,
      priority_score: template.priority_score,
      is_recommended: template.is_recommended,
      last_used_at: template.last_used_at,
    };
  }

  /**
   * Get top performing templates
   */
  static async getTopTemplates(
    tenantId: string,
    options: {
      template_type?: string;
      min_success_rate?: number;
      min_usage_count?: number;
      limit?: number;
    } = {}
  ): Promise<DocumentTemplate[]> {
    const { templates } = await DocumentTemplateModel.list(tenantId, {
      template_type: options.template_type,
      min_success_rate: options.min_success_rate,
      limit: options.limit || 10,
    });

    // Filter by minimum usage count if specified
    let filtered = templates;
    if (options.min_usage_count !== undefined) {
      filtered = templates.filter(t => t.usage_count >= options.min_usage_count);
    }

    // Sort by priority score (already sorted by model, but ensure)
    return filtered.sort((a, b) => {
      if (b.priority_score !== a.priority_score) {
        return b.priority_score - a.priority_score;
      }
      if (b.success_rate !== null && a.success_rate !== null) {
        return b.success_rate - a.success_rate;
      }
      return b.usage_count - a.usage_count;
    });
  }

  /**
   * Get recommended templates (high success rate, sufficient usage)
   */
  static async getRecommendedTemplates(
    tenantId: string,
    templateType?: string,
    limit = 10
  ): Promise<DocumentTemplate[]> {
    const { templates } = await DocumentTemplateModel.list(tenantId, {
      template_type: templateType,
      recommended_only: true,
      limit,
    });

    return templates;
  }

  /**
   * Record template usage
   */
  static async recordTemplateUsage(
    templateId: string,
    tenantId: string,
    userId: string,
    caseId?: string,
    documentId?: string
  ): Promise<void> {
    await DocumentTemplateModel.recordUsage(templateId, tenantId, userId, caseId, documentId);
    
    logger.info('Template usage recorded', {
      templateId,
      tenantId,
      userId,
      caseId,
      documentId,
    });
  }

  /**
   * Record template outcome (success/failure)
   */
  static async recordTemplateOutcome(
    templateId: string,
    tenantId: string,
    outcomeType: 'SUCCESS' | 'FAILURE' | 'PARTIAL',
    outcomeDate?: string,
    outcomeNotes?: string
  ): Promise<void> {
    await DocumentTemplateModel.recordOutcome(
      templateId,
      tenantId,
      outcomeType,
      outcomeDate,
      outcomeNotes
    );

    // Success rate and priority are automatically updated by database trigger
    logger.info('Template outcome recorded', {
      templateId,
      tenantId,
      outcomeType,
    });
  }

  /**
   * Get templates prioritized by success rate
   */
  static async getPrioritizedTemplates(
    tenantId: string,
    templateType?: string,
    limit = 20
  ): Promise<DocumentTemplate[]> {
    // Get templates sorted by priority score (which considers success rate)
    const { templates } = await DocumentTemplateModel.list(tenantId, {
      template_type: templateType,
      limit,
    });

    return templates;
  }

  /**
   * Update template recommendation status
   */
  static async updateRecommendationStatus(
    templateId: string,
    tenantId: string,
    isRecommended: boolean
  ): Promise<void> {
    await db.query(
      `UPDATE document_templates 
       SET is_recommended = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL`,
      [isRecommended, templateId, tenantId]
    );
  }
}
