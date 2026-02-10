import { db } from '../models/database';
import { RealEstateAssetModel, RealEstateAsset } from '../models/real-estate-asset';
import { getTenantContext } from '../utils/tenant-context';
import { logger } from '../utils/logger';
import { AuditService, AuditAction, AuditEventCategory } from './audit';

export interface VacancyAlert {
  asset_id: string;
  asset_code: string;
  property_address: string;
  vacancy_days: number;
  threshold_days: number;
  alert_type: 'threshold_reached' | 'extended_vacancy';
}

/**
 * Vacancy Monitoring Service
 * Monitors asset vacancy and sends alerts when thresholds are exceeded
 */
export class VacancyMonitoringService {
  /**
   * Check for assets that need vacancy alerts
   */
  static async checkVacancyAlerts(tenantId: string): Promise<VacancyAlert[]> {
    const alerts: VacancyAlert[] = [];

    // Get all vacant assets
    const { assets } = await RealEstateAssetModel.list(tenantId, {
      is_vacant: true,
      limit: 1000, // Get all vacant assets
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const asset of assets) {
      if (!asset.is_vacant || !asset.vacancy_start_date) {
        continue;
      }

      const vacancyStart = new Date(asset.vacancy_start_date);
      vacancyStart.setHours(0, 0, 0, 0);
      
      const vacancyDays = Math.floor((today.getTime() - vacancyStart.getTime()) / (1000 * 60 * 60 * 24));

      // Check if threshold reached and alert not sent
      if (vacancyDays >= asset.vacancy_alert_threshold_days && !asset.vacancy_alert_sent) {
        alerts.push({
          asset_id: asset.id,
          asset_code: asset.asset_code,
          property_address: asset.property_address,
          vacancy_days,
          threshold_days: asset.vacancy_alert_threshold_days,
          alert_type: 'threshold_reached',
        });
      }
      // Check for extended vacancy (2x threshold)
      else if (vacancyDays >= asset.vacancy_alert_threshold_days * 2) {
        alerts.push({
          asset_id: asset.id,
          asset_code: asset.asset_code,
          property_address: asset.property_address,
          vacancy_days,
          threshold_days: asset.vacancy_alert_threshold_days,
          alert_type: 'extended_vacancy',
        });
      }
    }

    return alerts;
  }

  /**
   * Send vacancy alert and mark as sent
   */
  static async sendVacancyAlert(
    tenantId: string,
    assetId: string,
    alert: VacancyAlert,
    userId?: string
  ): Promise<void> {
    // Mark alert as sent
    await db.query(
      `UPDATE real_estate_assets 
       SET vacancy_alert_sent = true,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [assetId, tenantId]
    );

    // Record in vacancy_monitoring table
    await db.query(
      `INSERT INTO vacancy_monitoring 
       (tenant_id, real_estate_asset_id, vacancy_start_date, alert_sent_at, 
        alert_sent_to, alert_type, alert_message)
       SELECT 
         $1, $2, vacancy_start_date, CURRENT_TIMESTAMP,
         $3, $4, $5
       FROM real_estate_assets
       WHERE id = $2 AND tenant_id = $1`,
      [
        tenantId,
        assetId,
        userId || null,
        alert.alert_type,
        `Asset ${alert.asset_code} has been vacant for ${alert.vacancy_days} days (threshold: ${alert.threshold_days} days)`,
      ]
    );

    logger.warn('Vacancy alert sent', {
      tenantId,
      assetId,
      assetCode: alert.asset_code,
      vacancyDays: alert.vacancy_days,
      alertType: alert.alert_type,
    });
  }

  /**
   * Process all vacancy alerts for a tenant
   */
  static async processVacancyAlerts(tenantId: string, userId?: string): Promise<number> {
    const alerts = await this.checkVacancyAlerts(tenantId);
    let sentCount = 0;

    for (const alert of alerts) {
      try {
        await this.sendVacancyAlert(tenantId, alert.asset_id, alert, userId);
        sentCount++;

        // Audit alert
        await AuditService.log({
          tenantId,
          userId: userId || 'system',
          userEmail: 'system',
          userRole: 'SYSTEM',
          action: AuditAction.READ,
          eventType: 'vacancy.alert',
          eventCategory: AuditEventCategory.SYSTEM,
          resourceType: 'real_estate_asset',
          resourceId: alert.asset_id,
          description: `Vacancy alert sent for asset ${alert.asset_code}: ${alert.vacancy_days} days vacant`,
        });
      } catch (error) {
        logger.error('Failed to send vacancy alert', {
          tenantId,
          assetId: alert.asset_id,
          error,
        });
      }
    }

    return sentCount;
  }

  /**
   * Get vacancy statistics for a tenant
   */
  static async getVacancyStatistics(tenantId: string): Promise<{
    total_assets: number;
    vacant_assets: number;
    occupied_assets: number;
    average_vacancy_days: number;
    assets_requiring_attention: number;
  }> {
    // Get all assets
    const { assets } = await RealEstateAssetModel.list(tenantId, { limit: 10000 });
    
    const vacantAssets = assets.filter(a => a.is_vacant);
    const occupiedAssets = assets.filter(a => !a.is_vacant);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalVacancyDays = 0;
    let assetsRequiringAttention = 0;

    for (const asset of vacantAssets) {
      if (asset.vacancy_start_date) {
        const vacancyStart = new Date(asset.vacancy_start_date);
        vacancyStart.setHours(0, 0, 0, 0);
        const vacancyDays = Math.floor((today.getTime() - vacancyStart.getTime()) / (1000 * 60 * 60 * 24));
        totalVacancyDays += vacancyDays;

        if (vacancyDays >= asset.vacancy_alert_threshold_days) {
          assetsRequiringAttention++;
        }
      }
    }

    const averageVacancyDays = vacantAssets.length > 0 
      ? Math.round(totalVacancyDays / vacantAssets.length) 
      : 0;

    return {
      total_assets: assets.length,
      vacant_assets: vacantAssets.length,
      occupied_assets: occupiedAssets.length,
      average_vacancy_days: averageVacancyDays,
      assets_requiring_attention: assetsRequiringAttention,
    };
  }

  /**
   * Update vacancy status when asset state changes
   */
  static async updateVacancyOnStateChange(
    asset: RealEstateAsset,
    newState: string
  ): Promise<void> {
    const tenantId = asset.tenant_id;

    // Assets in READY state can be vacant
    // Assets in SOLD or RENTED state are not vacant
    if (newState === 'SOLD' || newState === 'RENTED') {
      if (asset.is_vacant) {
        // End vacancy period
        await db.query(
          `UPDATE vacancy_monitoring 
           SET vacancy_end_date = CURRENT_DATE,
               total_vacancy_days = CURRENT_DATE - vacancy_start_date,
               is_resolved = true,
               resolved_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE real_estate_asset_id = $1 
             AND tenant_id = $2 
             AND is_resolved = false`,
          [asset.id, tenantId]
        );

        await RealEstateAssetModel.updateVacancy(asset.id, tenantId, false);
      }
    } else if (newState === 'READY') {
      // Start vacancy period if not already vacant
      if (!asset.is_vacant) {
        await RealEstateAssetModel.updateVacancy(asset.id, tenantId, true);
      }
    }
  }
}
