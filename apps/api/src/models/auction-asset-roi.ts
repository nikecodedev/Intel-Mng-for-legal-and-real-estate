import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError, NotFoundError } from '../utils/errors.js';

export interface ROIInputs {
  acquisition_price_cents: number;
  taxes_itbi_cents: number;
  legal_costs_cents: number;
  renovation_estimate_cents: number;
  expected_resale_value_cents: number;
  expected_resale_date?: string | null; // ISO date YYYY-MM-DD
}

export interface ROIOutputs {
  total_cost_cents: number;
  net_profit_cents: number;
  roi_percentage: number;
  break_even_date: string | null; // ISO date
}

export interface AuctionAssetROI {
  id: string;
  tenant_id: string;
  auction_asset_id: string;
  acquisition_price_cents: number;
  taxes_itbi_cents: number;
  legal_costs_cents: number;
  renovation_estimate_cents: number;
  expected_resale_value_cents: number;
  expected_resale_date: string | null;
  total_cost_cents: number;
  net_profit_cents: number;
  roi_percentage: number;
  break_even_date: string | null;
  version_number: number;
  updated_at: Date;
}

export interface ROICalculationVersion {
  id: string;
  tenant_id: string;
  auction_asset_id: string;
  version_number: number;
  inputs_snapshot: ROIInputs & { expected_resale_date?: string | null };
  total_cost_cents: number;
  net_profit_cents: number;
  roi_percentage: number;
  break_even_date: string | null;
  created_at: Date;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

/**
 * Compute ROI outputs from inputs.
 * total_cost = acquisition + taxes + legal + renovation
 * net_profit = expected_resale - total_cost
 * roi_percentage = (net_profit / total_cost) * 100 when total_cost > 0
 * break_even_date = expected_resale_date when provided, else null
 */
export function calculateROI(inputs: ROIInputs): ROIOutputs {
  const total_cost_cents =
    inputs.acquisition_price_cents +
    inputs.taxes_itbi_cents +
    inputs.legal_costs_cents +
    inputs.renovation_estimate_cents;
  const net_profit_cents = inputs.expected_resale_value_cents - total_cost_cents;
  const roi_percentage =
    total_cost_cents > 0 ? (net_profit_cents / total_cost_cents) * 100 : 0;
  const break_even_date =
    inputs.expected_resale_date && inputs.expected_resale_date.trim() !== ''
      ? inputs.expected_resale_date
      : null;
  return {
    total_cost_cents,
    net_profit_cents,
    roi_percentage: Math.round(roi_percentage * 100) / 100,
    break_even_date,
  };
}

function mapROIRow(row: Record<string, unknown>): AuctionAssetROI {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    auction_asset_id: row.auction_asset_id as string,
    acquisition_price_cents: Number(row.acquisition_price_cents) || 0,
    taxes_itbi_cents: Number(row.taxes_itbi_cents) || 0,
    legal_costs_cents: Number(row.legal_costs_cents) || 0,
    renovation_estimate_cents: Number(row.renovation_estimate_cents) || 0,
    expected_resale_value_cents: Number(row.expected_resale_value_cents) || 0,
    expected_resale_date: row.expected_resale_date != null ? String(row.expected_resale_date) : null,
    total_cost_cents: Number(row.total_cost_cents) || 0,
    net_profit_cents: Number(row.net_profit_cents) || 0,
    roi_percentage: Number(row.roi_percentage) || 0,
    break_even_date: row.break_even_date != null ? String(row.break_even_date) : null,
    version_number: Number(row.version_number) || 1,
    updated_at: new Date(row.updated_at as string),
  };
}

function mapVersionRow(row: Record<string, unknown>): ROICalculationVersion {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    auction_asset_id: row.auction_asset_id as string,
    version_number: Number(row.version_number) || 1,
    inputs_snapshot: (row.inputs_snapshot as ROIInputs & { expected_resale_date?: string | null }) ?? {},
    total_cost_cents: Number(row.total_cost_cents) || 0,
    net_profit_cents: Number(row.net_profit_cents) || 0,
    roi_percentage: Number(row.roi_percentage) || 0,
    break_even_date: row.break_even_date != null ? String(row.break_even_date) : null,
    created_at: new Date(row.created_at as string),
  };
}

export class AuctionAssetROIModel {
  static async getByAssetId(auctionAssetId: string, tenantId: string): Promise<AuctionAssetROI | null> {
    requireTenantId(tenantId, 'AuctionAssetROIModel.getByAssetId');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `SELECT * FROM auction_asset_roi WHERE auction_asset_id = $1 AND tenant_id = $2`,
      [auctionAssetId, tenantId]
    );
    return result.rows[0] ? mapROIRow(result.rows[0]) : null;
  }

  /**
   * Update ROI inputs for an asset. Recalculates outputs, bumps version, appends to roi_calculation_versions.
   * Returns the updated ROI row. Caller must audit the recalculation.
   */
  static async updateInputs(
    auctionAssetId: string,
    tenantId: string,
    inputs: Partial<ROIInputs>
  ): Promise<{ roi: AuctionAssetROI; isNew: boolean }> {
    requireTenantId(tenantId, 'AuctionAssetROIModel.updateInputs');

    const existing = await this.getByAssetId(auctionAssetId, tenantId);
    const isNew = !existing;

    const merged: ROIInputs = {
      acquisition_price_cents: inputs.acquisition_price_cents ?? existing?.acquisition_price_cents ?? 0,
      taxes_itbi_cents: inputs.taxes_itbi_cents ?? existing?.taxes_itbi_cents ?? 0,
      legal_costs_cents: inputs.legal_costs_cents ?? existing?.legal_costs_cents ?? 0,
      renovation_estimate_cents: inputs.renovation_estimate_cents ?? existing?.renovation_estimate_cents ?? 0,
      expected_resale_value_cents: inputs.expected_resale_value_cents ?? existing?.expected_resale_value_cents ?? 0,
      expected_resale_date: inputs.expected_resale_date !== undefined ? inputs.expected_resale_date : existing?.expected_resale_date ?? null,
    };

    const outputs = calculateROI(merged);
    const nextVersion = (existing?.version_number ?? 0) + 1;

    if (existing) {
      await db.query(
        `UPDATE auction_asset_roi SET
          acquisition_price_cents = $1, taxes_itbi_cents = $2, legal_costs_cents = $3,
          renovation_estimate_cents = $4, expected_resale_value_cents = $5, expected_resale_date = $6,
          total_cost_cents = $7, net_profit_cents = $8, roi_percentage = $9, break_even_date = $10,
          version_number = $11, updated_at = CURRENT_TIMESTAMP
         WHERE auction_asset_id = $12 AND tenant_id = $13`,
        [
          merged.acquisition_price_cents,
          merged.taxes_itbi_cents,
          merged.legal_costs_cents,
          merged.renovation_estimate_cents,
          merged.expected_resale_value_cents,
          merged.expected_resale_date ?? null,
          outputs.total_cost_cents,
          outputs.net_profit_cents,
          outputs.roi_percentage,
          outputs.break_even_date,
          nextVersion,
          auctionAssetId,
          tenantId,
        ]
      );
    } else {
      await db.query(
        `INSERT INTO auction_asset_roi (
          tenant_id, auction_asset_id,
          acquisition_price_cents, taxes_itbi_cents, legal_costs_cents,
          renovation_estimate_cents, expected_resale_value_cents, expected_resale_date,
          total_cost_cents, net_profit_cents, roi_percentage, break_even_date,
          version_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          tenantId,
          auctionAssetId,
          merged.acquisition_price_cents,
          merged.taxes_itbi_cents,
          merged.legal_costs_cents,
          merged.renovation_estimate_cents,
          merged.expected_resale_value_cents,
          merged.expected_resale_date ?? null,
          outputs.total_cost_cents,
          outputs.net_profit_cents,
          outputs.roi_percentage,
          outputs.break_even_date,
          nextVersion,
        ]
      );
    }

    // Append versioned record for audit/history
    await db.query(
      `INSERT INTO roi_calculation_versions (
        tenant_id, auction_asset_id, version_number, inputs_snapshot,
        total_cost_cents, net_profit_cents, roi_percentage, break_even_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tenantId,
        auctionAssetId,
        nextVersion,
        JSON.stringify(merged),
        outputs.total_cost_cents,
        outputs.net_profit_cents,
        outputs.roi_percentage,
        outputs.break_even_date,
      ]
    );

    const roi = await this.getByAssetId(auctionAssetId, tenantId);
    if (!roi) throw new NotFoundError('Auction asset ROI');
    return { roi, isNew };
  }

  static async listVersions(
    auctionAssetId: string,
    tenantId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<ROICalculationVersion[]> {
    requireTenantId(tenantId, 'AuctionAssetROIModel.listVersions');
    const limit = Math.min(options.limit ?? 50, 100);
    const offset = options.offset ?? 0;
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `SELECT * FROM roi_calculation_versions
       WHERE auction_asset_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC, version_number DESC
       LIMIT $3 OFFSET $4`,
      [auctionAssetId, tenantId, limit, offset]
    );
    return result.rows.map(mapVersionRow);
  }
}
