import { db } from './database';
import { QueryResult } from 'pg';
import { TenantRequiredError } from '../utils/errors';

/**
 * Investor Asset Link interface
 * Links investors to auction assets they can view (read-only)
 */
export interface InvestorAssetLink {
  id: string;
  tenant_id: string;
  investor_user_id: string;
  auction_asset_id: string;
  granted_by: string | null;
  granted_at: Date;
  access_notes: string | null;
  revoked_at: Date | null;
  revoked_by: string | null;
  revocation_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateInvestorAssetLinkInput {
  tenant_id: string;
  investor_user_id: string;
  auction_asset_id: string;
  granted_by?: string;
  access_notes?: string;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function mapRow(row: Record<string, unknown>): InvestorAssetLink {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    investor_user_id: row.investor_user_id as string,
    auction_asset_id: row.auction_asset_id as string,
    granted_by: (row.granted_by as string) ?? null,
    granted_at: new Date(row.granted_at as string),
    access_notes: (row.access_notes as string) ?? null,
    revoked_at: row.revoked_at ? new Date(row.revoked_at as string) : null,
    revoked_by: (row.revoked_by as string) ?? null,
    revocation_reason: (row.revocation_reason as string) ?? null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

/**
 * Investor Asset Link Model
 * Manages which auction assets investors can access (read-only)
 */
export class InvestorAssetLinkModel {
  /**
   * Find link by ID within tenant
   */
  static async findById(id: string, tenantId: string): Promise<InvestorAssetLink | null> {
    requireTenantId(tenantId, 'InvestorAssetLinkModel.findById');
    
    const result: QueryResult<InvestorAssetLink> = await db.query<InvestorAssetLink>(
      `SELECT * FROM investor_asset_links 
       WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
      [id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * Find all active links for an investor
   */
  static async findByInvestor(investorUserId: string, tenantId: string): Promise<InvestorAssetLink[]> {
    requireTenantId(tenantId, 'InvestorAssetLinkModel.findByInvestor');
    
    const result: QueryResult<InvestorAssetLink> = await db.query<InvestorAssetLink>(
      `SELECT * FROM investor_asset_links 
       WHERE investor_user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL
       ORDER BY granted_at DESC`,
      [investorUserId, tenantId]
    );
    return result.rows.map(mapRow);
  }

  /**
   * Find all investors with access to an asset
   */
  static async findByAsset(auctionAssetId: string, tenantId: string): Promise<InvestorAssetLink[]> {
    requireTenantId(tenantId, 'InvestorAssetLinkModel.findByAsset');
    
    const result: QueryResult<InvestorAssetLink> = await db.query<InvestorAssetLink>(
      `SELECT * FROM investor_asset_links 
       WHERE auction_asset_id = $1 AND tenant_id = $2 AND revoked_at IS NULL
       ORDER BY granted_at DESC`,
      [auctionAssetId, tenantId]
    );
    return result.rows.map(mapRow);
  }

  /**
   * Check if investor has access to asset
   */
  static async hasAccess(investorUserId: string, auctionAssetId: string, tenantId: string): Promise<boolean> {
    requireTenantId(tenantId, 'InvestorAssetLinkModel.hasAccess');
    
    const result = await db.query(
      `SELECT 1 FROM investor_asset_links 
       WHERE investor_user_id = $1 
         AND auction_asset_id = $2 
         AND tenant_id = $3 
         AND revoked_at IS NULL
       LIMIT 1`,
      [investorUserId, auctionAssetId, tenantId]
    );
    return result.rows.length > 0;
  }

  /**
   * Create new asset link
   */
  static async create(input: CreateInvestorAssetLinkInput): Promise<InvestorAssetLink> {
    requireTenantId(input.tenant_id, 'InvestorAssetLinkModel.create');
    
    const result: QueryResult<InvestorAssetLink> = await db.query<InvestorAssetLink>(
      `INSERT INTO investor_asset_links 
       (tenant_id, investor_user_id, auction_asset_id, granted_by, access_notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.tenant_id,
        input.investor_user_id,
        input.auction_asset_id,
        input.granted_by || null,
        input.access_notes || null,
      ]
    );
    return mapRow(result.rows[0]);
  }

  /**
   * Revoke asset access
   */
  static async revoke(
    id: string,
    tenantId: string,
    revokedBy: string,
    reason?: string
  ): Promise<InvestorAssetLink> {
    requireTenantId(tenantId, 'InvestorAssetLinkModel.revoke');
    
    const result: QueryResult<InvestorAssetLink> = await db.query<InvestorAssetLink>(
      `UPDATE investor_asset_links 
       SET revoked_at = CURRENT_TIMESTAMP,
           revoked_by = $1,
           revocation_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND tenant_id = $4 AND revoked_at IS NULL
       RETURNING *`,
      [revokedBy, reason || null, id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Investor asset link not found or already revoked');
    }

    return mapRow(result.rows[0]);
  }

  /**
   * Get all asset IDs accessible to an investor
   */
  static async getAccessibleAssetIds(investorUserId: string, tenantId: string): Promise<string[]> {
    requireTenantId(tenantId, 'InvestorAssetLinkModel.getAccessibleAssetIds');
    
    const result = await db.query<{ auction_asset_id: string }>(
      `SELECT auction_asset_id FROM investor_asset_links 
       WHERE investor_user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
      [investorUserId, tenantId]
    );
    return result.rows.map(row => row.auction_asset_id);
  }
}
