import { RealEstateAssetModel, RealEstateAsset } from '../models/real-estate-asset';
import { AssetCostModel } from '../models/asset-cost';

export interface RealCostBreakdown {
  acquisition_cost_cents: number;
  regularization_cost_cents: number;
  renovation_cost_cents: number;
  maintenance_cost_cents: number;
  taxes_cost_cents: number;
  legal_cost_cents: number;
  other_cost_cents: number;
  total_cost_cents: number;
  acquisition_price_cents: number | null;
  total_real_cost_cents: number; // acquisition + all costs
}

/**
 * Asset Cost Calculation Service
 * Calculates real cost dynamically including all associated costs
 */
export class AssetCostCalculationService {
  /**
   * Calculate real cost for an asset
   * Includes acquisition price + all costs
   */
  static async calculateRealCost(
    assetId: string,
    tenantId: string,
    options?: {
      include_pending_payments?: boolean;
      cost_types?: string[];
    }
  ): Promise<RealCostBreakdown> {
    // Get asset
    const asset = await RealEstateAssetModel.findById(assetId, tenantId);
    if (!asset) {
      throw new Error('Asset not found');
    }

    // Get cost totals by type
    const costTotals = await AssetCostModel.calculateTotalCosts(assetId, tenantId, {
      include_pending: options?.include_pending_payments !== false,
    });

    // Build breakdown
    const breakdown: RealCostBreakdown = {
      acquisition_cost_cents: costTotals.by_type.acquisition || 0,
      regularization_cost_cents: costTotals.by_type.regularization || 0,
      renovation_cost_cents: costTotals.by_type.renovation || 0,
      maintenance_cost_cents: costTotals.by_type.maintenance || 0,
      taxes_cost_cents: costTotals.by_type.taxes || 0,
      legal_cost_cents: costTotals.by_type.legal || 0,
      other_cost_cents: costTotals.by_type.other || 0,
      total_cost_cents: costTotals.total_cents,
      acquisition_price_cents: asset.acquisition_price_cents,
      total_real_cost_cents: 0,
    };

    // Calculate total real cost (acquisition + all costs)
    breakdown.total_real_cost_cents =
      (asset.acquisition_price_cents || 0) + breakdown.total_cost_cents;

    return breakdown;
  }

  /**
   * Get cost breakdown with formatted values
   */
  static async getCostBreakdownFormatted(
    assetId: string,
    tenantId: string
  ): Promise<RealCostBreakdown & { formatted: Record<string, string> }> {
    const breakdown = await this.calculateRealCost(assetId, tenantId);

    return {
      ...breakdown,
      formatted: {
        acquisition_cost: `R$ ${(breakdown.acquisition_cost_cents / 100).toFixed(2)}`,
        regularization_cost: `R$ ${(breakdown.regularization_cost_cents / 100).toFixed(2)}`,
        renovation_cost: `R$ ${(breakdown.renovation_cost_cents / 100).toFixed(2)}`,
        maintenance_cost: `R$ ${(breakdown.maintenance_cost_cents / 100).toFixed(2)}`,
        taxes_cost: `R$ ${(breakdown.taxes_cost_cents / 100).toFixed(2)}`,
        legal_cost: `R$ ${(breakdown.legal_cost_cents / 100).toFixed(2)}`,
        other_cost: `R$ ${(breakdown.other_cost_cents / 100).toFixed(2)}`,
        total_cost: `R$ ${(breakdown.total_cost_cents / 100).toFixed(2)}`,
        acquisition_price: breakdown.acquisition_price_cents
          ? `R$ ${(breakdown.acquisition_price_cents / 100).toFixed(2)}`
          : 'N/A',
        total_real_cost: `R$ ${(breakdown.total_real_cost_cents / 100).toFixed(2)}`,
      },
    };
  }
}
