import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError, InvalidTransitionError, NotFoundError } from '../utils/errors.js';

export const AUCTION_STAGES = ['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9'] as const;
export type AuctionStage = (typeof AUCTION_STAGES)[number];

export type DueDiligenceStatus = 'ok' | 'risk' | 'pending';

export interface DueDiligenceItem {
  status: DueDiligenceStatus;
  notes: string | null;
}

export interface DueDiligenceChecklist {
  occupancy: DueDiligenceItem;
  debts: DueDiligenceItem;
  legal_risks: DueDiligenceItem;
  zoning: DueDiligenceItem;
}

const DEFAULT_CHECKLIST: DueDiligenceChecklist = {
  occupancy: { status: 'pending', notes: null },
  debts: { status: 'pending', notes: null },
  legal_risks: { status: 'pending', notes: null },
  zoning: { status: 'pending', notes: null },
};

export interface AuctionAsset {
  id: string;
  tenant_id: string;
  current_stage: AuctionStage;
  linked_document_ids: string[];
  due_diligence_checklist: DueDiligenceChecklist;
  risk_score: number;
  asset_reference: string | null;
  title: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAuctionAssetInput {
  tenant_id: string;
  linked_document_ids?: string[];
  asset_reference?: string;
  title?: string;
}

export interface UpdateDueDiligenceInput {
  occupancy?: DueDiligenceItem;
  debts?: DueDiligenceItem;
  legal_risks?: DueDiligenceItem;
  zoning?: DueDiligenceItem;
}

const RISK_HIGH_THRESHOLD = 70;

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function parseChecklist(raw: unknown): DueDiligenceChecklist {
  if (!raw || typeof raw !== 'object') return DEFAULT_CHECKLIST;
  const o = raw as Record<string, unknown>;
  const item = (key: keyof DueDiligenceChecklist): DueDiligenceItem => {
    const v = o[key];
    if (!v || typeof v !== 'object') return DEFAULT_CHECKLIST[key];
    const vv = v as Record<string, unknown>;
    const status = (vv.status === 'ok' || vv.status === 'risk' || vv.status === 'pending')
      ? vv.status
      : 'pending';
    return { status, notes: typeof vv.notes === 'string' ? vv.notes : null };
  };
  return {
    occupancy: item('occupancy'),
    debts: item('debts'),
    legal_risks: item('legal_risks'),
    zoning: item('zoning'),
  };
}

function mapRow(row: Record<string, unknown>): AuctionAsset {
  const linked = row.linked_document_ids;
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    current_stage: row.current_stage as AuctionStage,
    linked_document_ids: Array.isArray(linked) ? (linked as string[]) : [],
    due_diligence_checklist: parseChecklist(row.due_diligence_checklist),
    risk_score: Number(row.risk_score) || 0,
    asset_reference: (row.asset_reference as string) ?? null,
    title: (row.title as string) ?? null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

/**
 * Strict state machine: only F0->F1->...->F9. Cannot skip stages.
 */
function getNextStage(current: AuctionStage): AuctionStage | null {
  const i = AUCTION_STAGES.indexOf(current);
  if (i < 0 || i >= AUCTION_STAGES.length - 1) return null;
  return AUCTION_STAGES[i + 1];
}

/**
 * Calculate risk score 0-100 from due diligence checklist.
 * ok=0, pending=15, risk=25 per category. Total capped at 100.
 */
export function calculateRiskScore(checklist: DueDiligenceChecklist): number {
  let score = 0;
  const categories: (keyof DueDiligenceChecklist)[] = ['occupancy', 'debts', 'legal_risks', 'zoning'];
  for (const key of categories) {
    const item = checklist[key];
    if (item.status === 'ok') score += 0;
    else if (item.status === 'pending') score += 15;
    else score += 25; // risk
  }
  return Math.min(100, score);
}

export function isRiskHigh(riskScore: number): boolean {
  return riskScore >= RISK_HIGH_THRESHOLD;
}

export const RISK_HIGH_THRESHOLD_EXPORT = RISK_HIGH_THRESHOLD;

export class AuctionAssetModel {
  static async findById(id: string, tenantId: string): Promise<AuctionAsset | null> {
    requireTenantId(tenantId, 'AuctionAssetModel.findById');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `SELECT * FROM auction_assets WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  static async listByTenant(
    tenantId: string,
    options: { stage?: AuctionStage; limit?: number; offset?: number } = {}
  ): Promise<AuctionAsset[]> {
    requireTenantId(tenantId, 'AuctionAssetModel.listByTenant');
    let query = `SELECT * FROM auction_assets WHERE tenant_id = $1`;
    const params: unknown[] = [tenantId];
    let idx = 2;
    if (options.stage) {
      query += ` AND current_stage = $${idx++}`;
      params.push(options.stage);
    }
    query += ` ORDER BY created_at DESC`;
    const limit = Math.min(options.limit ?? 50, 100);
    const offset = options.offset ?? 0;
    query += ` LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(limit, offset);
    const result: QueryResult<Record<string, unknown>> = await db.query(query, params);
    return result.rows.map(mapRow);
  }

  static async create(input: CreateAuctionAssetInput): Promise<AuctionAsset> {
    requireTenantId(input.tenant_id, 'AuctionAssetModel.create');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `INSERT INTO auction_assets (tenant_id, linked_document_ids, asset_reference, title)
       VALUES ($1, $2::uuid[], $3, $4)
       RETURNING *`,
      [
        input.tenant_id,
        input.linked_document_ids ?? [],
        input.asset_reference ?? null,
        input.title ?? null,
      ]
    );
    return mapRow(result.rows[0]);
  }

  /**
   * Transition to next stage only. Strict: cannot skip. Invalid transition throws InvalidTransitionError.
   */
  static async transitionStage(
    id: string,
    tenantId: string,
    toStage: string
  ): Promise<{ asset: AuctionAsset; previous_stage: AuctionStage }> {
    requireTenantId(tenantId, 'AuctionAssetModel.transitionStage');
    const asset = await this.findById(id, tenantId);
    if (!asset) {
      throw new NotFoundError('Auction asset');
    }
    const current = asset.current_stage;
    const nextAllowed = getNextStage(current);
    if (!nextAllowed) {
      throw new InvalidTransitionError(
        `Cannot transition from ${current}: no next stage (already at F9).`,
        current,
        toStage
      );
    }
    if (toStage !== nextAllowed) {
      throw new InvalidTransitionError(
        `Invalid transition: from ${current} only ${nextAllowed} is allowed (cannot skip stages). Requested: ${toStage}`,
        current,
        toStage
      );
    }
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `UPDATE auction_assets SET current_stage = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [toStage, id, tenantId]
    );
    const updated = mapRow(result.rows[0]);
    return { asset: updated, previous_stage: current };
  }

  static async updateDueDiligence(
    id: string,
    tenantId: string,
    input: UpdateDueDiligenceInput
  ): Promise<AuctionAsset> {
    requireTenantId(tenantId, 'AuctionAssetModel.updateDueDiligence');
    const asset = await this.findById(id, tenantId);
    if (!asset) throw new NotFoundError('Auction asset');
    const checklist: DueDiligenceChecklist = {
      occupancy: input.occupancy ?? asset.due_diligence_checklist.occupancy,
      debts: input.debts ?? asset.due_diligence_checklist.debts,
      legal_risks: input.legal_risks ?? asset.due_diligence_checklist.legal_risks,
      zoning: input.zoning ?? asset.due_diligence_checklist.zoning,
    };
    const riskScore = calculateRiskScore(checklist);
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `UPDATE auction_assets
       SET due_diligence_checklist = $1, risk_score = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [JSON.stringify(checklist), riskScore, id, tenantId]
    );
    return mapRow(result.rows[0]);
  }

  static async updateLinkedDocuments(
    id: string,
    tenantId: string,
    linkedDocumentIds: string[]
  ): Promise<AuctionAsset | null> {
    requireTenantId(tenantId, 'AuctionAssetModel.updateLinkedDocuments');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `UPDATE auction_assets SET linked_document_ids = $1::uuid[], updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [linkedDocumentIds, id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }
}

export class AuctionBidModel {
  static async create(
    tenantId: string,
    auctionAssetId: string,
    bidderUserId: string,
    amountCents: number
  ): Promise<{ id: string }> {
    requireTenantId(tenantId, 'AuctionBidModel.create');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `INSERT INTO auction_bids (tenant_id, auction_asset_id, bidder_user_id, amount_cents)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [tenantId, auctionAssetId, bidderUserId, amountCents]
    );
    return { id: result.rows[0].id as string };
  }
}
