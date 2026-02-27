import { db } from '../models/database.js';
import { InvestorPreferenceProfileModel, InvestorPreferenceProfile } from '../models/investor-preference-profile.js';
import { KYCDataModel } from '../models/kyc-data.js';
import { AuctionAssetModel, AuctionAsset } from '../models/auction-asset.js';
import { AuctionAssetROIModel } from '../models/auction-asset-roi.js';
import { logger } from '../utils/logger.js';
import { AuditService, AuditAction, AuditEventCategory } from './audit.js';

export interface MatchScore {
  overall_score: number; // 0-100
  budget_score: number;
  risk_score: number;
  asset_type_score: number;
  location_score: number;
  property_characteristics_score: number;
  roi_score: number;
  breakdown: {
    budget_match: string;
    risk_match: string;
    asset_type_match: string;
    location_match: string;
    property_match: string;
    roi_match: string;
  };
}

export interface MatchRecord {
  id: string;
  tenant_id: string;
  investor_user_id: string;
  auction_asset_id: string;
  investor_preference_profile_id: string | null;
  match_score: number;
  budget_score: number | null;
  risk_score: number | null;
  asset_type_score: number | null;
  location_score: number | null;
  property_characteristics_score: number | null;
  roi_score: number | null;
  match_status: string;
  is_auto_notified: boolean;
  notification_sent_at: Date | null;
  created_at: Date;
}

/**
 * Investor Matching Engine Service
 * Compares investor profiles with auction assets and scores matches (0-100)
 */
export class InvestorMatchingService {
  /**
   * Calculate match score between investor profile and auction asset
   */
  static async calculateMatchScore(
    profile: InvestorPreferenceProfile,
    asset: AuctionAsset,
    roi?: { roi_percentage: number | null }
  ): Promise<MatchScore> {
    const scores: MatchScore = {
      overall_score: 0,
      budget_score: 0,
      risk_score: 0,
      asset_type_score: 0,
      location_score: 0,
      property_characteristics_score: 0,
      roi_score: 0,
      breakdown: {
        budget_match: '',
        risk_match: '',
        asset_type_match: '',
        location_match: '',
        property_match: '',
        roi_match: '',
      },
    };

    // 1. Budget Score (30% weight)
    scores.budget_score = this.calculateBudgetScore(profile, asset, roi);
    scores.breakdown.budget_match = this.getBudgetMatchDescription(profile, asset, roi);

    // 2. Risk Score (25% weight)
    scores.risk_score = this.calculateRiskScore(profile, asset);
    scores.breakdown.risk_match = this.getRiskMatchDescription(profile, asset);

    // 3. Asset Type Score (15% weight)
    scores.asset_type_score = this.calculateAssetTypeScore(profile, asset);
    scores.breakdown.asset_type_match = this.getAssetTypeMatchDescription(profile, asset);

    // 4. Location Score (10% weight)
    scores.location_score = this.calculateLocationScore(profile, asset);
    scores.breakdown.location_match = this.getLocationMatchDescription(profile, asset);

    // 5. Property Characteristics Score (10% weight)
    scores.property_characteristics_score = this.calculatePropertyCharacteristicsScore(profile, asset);
    scores.breakdown.property_match = this.getPropertyMatchDescription(profile, asset);

    // 6. ROI Score (10% weight)
    scores.roi_score = this.calculateROIScore(profile, roi);
    scores.breakdown.roi_match = this.getROIMatchDescription(profile, roi);

    // Calculate weighted overall score
    scores.overall_score = Math.round(
      scores.budget_score * 0.30 +
      scores.risk_score * 0.25 +
      scores.asset_type_score * 0.15 +
      scores.location_score * 0.10 +
      scores.property_characteristics_score * 0.10 +
      scores.roi_score * 0.10
    );

    return scores;
  }

  /**
   * Calculate budget match score (0-100)
   */
  private static calculateBudgetScore(
    profile: InvestorPreferenceProfile,
    asset: AuctionAsset,
    roi?: { roi_percentage?: number | null; acquisition_price_cents?: number | null }
  ): number {
    // Get asset price from ROI
    const assetPrice = roi?.acquisition_price_cents || 0;

    if (assetPrice === 0) {
      return 50; // Neutral score if price unknown
    }

    const minBudget = profile.min_budget_cents || 0;
    const maxBudget = profile.max_budget_cents;
    const preferredBudget = profile.preferred_budget_cents;

    // Check if within budget range
    if (assetPrice < minBudget || assetPrice > maxBudget) {
      return 0; // Out of budget range
    }

    // Calculate score based on proximity to preferred budget
    if (preferredBudget) {
      const diff = Math.abs(assetPrice - preferredBudget);
      const range = maxBudget - minBudget;
      if (range === 0) return 100;
      const proximity = 1 - (diff / range);
      return Math.max(0, Math.min(100, Math.round(proximity * 100)));
    }

    // If no preferred budget, score based on position in range
    const range = maxBudget - minBudget;
    if (range === 0) return 100;
    const position = (assetPrice - minBudget) / range;
    // Prefer middle of range (50-70% of range)
    const idealPosition = 0.6;
    const distance = Math.abs(position - idealPosition);
    return Math.max(0, Math.min(100, Math.round((1 - distance) * 100)));
  }

  /**
   * Calculate risk match score (0-100)
   */
  private static calculateRiskScore(
    profile: InvestorPreferenceProfile,
    asset: AuctionAsset
  ): number {
    const assetRisk = asset.risk_score || 50;
    const investorRiskTolerance = profile.risk_tolerance_score;
    const maxAcceptableRisk = profile.max_acceptable_risk_score;

    // Check if asset risk exceeds maximum acceptable
    if (maxAcceptableRisk !== null && assetRisk > maxAcceptableRisk) {
      return 0;
    }

    // Calculate score based on risk alignment
    // Lower risk assets for conservative investors, higher risk for aggressive
    const riskDiff = Math.abs(assetRisk - investorRiskTolerance);
    const maxDiff = 100; // Maximum possible difference
    const alignment = 1 - (riskDiff / maxDiff);
    return Math.max(0, Math.min(100, Math.round(alignment * 100)));
  }

  /**
   * Calculate asset type match score (0-100)
   */
  private static calculateAssetTypeScore(
    profile: InvestorPreferenceProfile,
    asset: AuctionAsset
  ): number {
    // AuctionAsset doesn't have property_type directly, use title or metadata
    const assetType = (asset.metadata as any)?.property_type || asset.title || '';
    const preferredTypes = profile.preferred_asset_types || [];
    const excludedTypes = profile.excluded_asset_types || [];

    // Check if excluded
    if (excludedTypes.length > 0 && excludedTypes.includes(assetType)) {
      return 0;
    }

    // Check if preferred
    if (preferredTypes.length > 0) {
      if (preferredTypes.includes(assetType)) {
        return 100;
      }
      // Partial match (e.g., "apartment" matches "residential")
      const partialMatch = preferredTypes.some(type => 
        assetType.toLowerCase().includes(type.toLowerCase()) ||
        type.toLowerCase().includes(assetType.toLowerCase())
      );
      if (partialMatch) {
        return 70;
      }
      return 30; // Not preferred but not excluded
    }

    return 50; // No preferences specified
  }

  /**
   * Calculate location match score (0-100)
   */
  private static calculateLocationScore(
    profile: InvestorPreferenceProfile,
    asset: AuctionAsset
  ): number {
    const preferredLocations = profile.preferred_locations || [];
    const excludedLocations = profile.excluded_locations || [];

    // Extract location from asset (would need to be stored in asset metadata)
    const assetLocation = (asset.metadata as any)?.location || '';

    if (!assetLocation) {
      return 50; // Neutral if location unknown
    }

    // Check if excluded
    if (excludedLocations.length > 0) {
      const isExcluded = excludedLocations.some(loc =>
        assetLocation.toLowerCase().includes(loc.toLowerCase())
      );
      if (isExcluded) {
        return 0;
      }
    }

    // Check if preferred
    if (preferredLocations.length > 0) {
      const isPreferred = preferredLocations.some(loc =>
        assetLocation.toLowerCase().includes(loc.toLowerCase())
      );
      if (isPreferred) {
        return 100;
      }
      return 30; // Not preferred
    }

    return 50; // No location preferences
  }

  /**
   * Calculate property characteristics match score (0-100)
   */
  private static calculatePropertyCharacteristicsScore(
    profile: InvestorPreferenceProfile,
    asset: AuctionAsset
  ): number {
    // AuctionAsset doesn't have property characteristics directly
    // Would need to link to real_estate_assets table or store in metadata
    // For now, return neutral score
    return 50;
  }

  /**
   * Calculate ROI match score (0-100)
   */
  private static calculateROIScore(
    profile: InvestorPreferenceProfile,
    roi?: { roi_percentage: number | null }
  ): number {
    if (!roi || roi.roi_percentage === null) {
      return 50; // Neutral if ROI unknown
    }

    const minExpectedROI = profile.min_expected_roi_percentage;
    if (minExpectedROI === null) {
      return 50; // No ROI preference
    }

    if (roi.roi_percentage < minExpectedROI) {
      return 0; // Below minimum
    }

    // Score based on how much above minimum
    const excess = roi.roi_percentage - minExpectedROI;
    const bonus = Math.min(50, excess * 10); // Up to 50 bonus points
    return Math.min(100, 50 + bonus);
  }

  /**
   * Get match descriptions for breakdown
   */
  private static getBudgetMatchDescription(
    profile: InvestorPreferenceProfile,
    asset: AuctionAsset,
    roi?: { roi_percentage?: number | null; acquisition_price_cents?: number | null }
  ): string {
    const price = roi?.acquisition_price_cents || 0;
    if (price < (profile.min_budget_cents || 0)) return 'Below minimum budget';
    if (price > profile.max_budget_cents) return 'Above maximum budget';
    return 'Within budget range';
  }

  private static getRiskMatchDescription(profile: InvestorPreferenceProfile, asset: AuctionAsset): string {
    const assetRisk = asset.risk_score || 50;
    const tolerance = profile.risk_tolerance_score;
    if (assetRisk > tolerance + 20) return 'Higher risk than preferred';
    if (assetRisk < tolerance - 20) return 'Lower risk than preferred';
    return 'Risk aligned with tolerance';
  }

  private static getAssetTypeMatchDescription(profile: InvestorPreferenceProfile, asset: AuctionAsset): string {
    const assetType = (asset.metadata as any)?.property_type || asset.title || '';
    if (profile.excluded_asset_types?.includes(assetType)) return 'Excluded asset type';
    if (profile.preferred_asset_types?.includes(assetType)) return 'Preferred asset type';
    return 'Neutral asset type';
  }

  private static getLocationMatchDescription(profile: InvestorPreferenceProfile, asset: AuctionAsset): string {
    return 'Location match'; // Simplified
  }

  private static getPropertyMatchDescription(profile: InvestorPreferenceProfile, asset: AuctionAsset): string {
    return 'Property characteristics match'; // Simplified
  }

  private static getROIMatchDescription(profile: InvestorPreferenceProfile, roi?: { roi_percentage: number | null }): string {
    if (!roi || roi.roi_percentage === null) return 'ROI unknown';
    const minROI = profile.min_expected_roi_percentage;
    if (minROI === null) return 'No ROI preference';
    if (roi.roi_percentage >= minROI) return `ROI meets minimum (${roi.roi_percentage}%)`;
    return `ROI below minimum (${roi.roi_percentage}% < ${minROI}%)`;
  }

  /**
   * Find matches for an investor
   */
  static async findMatchesForInvestor(
    investorUserId: string,
    tenantId: string,
    limit = 50
  ): Promise<MatchRecord[]> {
    // Check KYC approval
    const hasApprovedKYC = await KYCDataModel.hasApprovedKYC(investorUserId, tenantId);
    if (!hasApprovedKYC) {
      throw new Error('Investor must have approved KYC to access matching');
    }

    // Get investor profile
    const profile = await InvestorPreferenceProfileModel.findByInvestorId(investorUserId, tenantId);
    if (!profile) {
      throw new Error('Investor preference profile not found');
    }

    // Get all active auction assets
    const assets = await AuctionAssetModel.listByTenant(tenantId, { limit: 1000 });

    const matches: MatchRecord[] = [];

    for (const asset of assets) {
      try {
        // Get ROI if available
        const roiData = await AuctionAssetROIModel.findByAssetId(asset.id, tenantId);
        const roi = roiData ? { 
          roi_percentage: roiData.roi_percentage,
          acquisition_price_cents: roiData.acquisition_price_cents 
        } : undefined;

        // Calculate match score
        const matchScore = await this.calculateMatchScore(profile, asset, roi);

        // Create match record
        const matchRecord = await this.createMatchRecord(
          tenantId,
          investorUserId,
          asset.id,
          profile.id,
          matchScore
        );

        matches.push(matchRecord);
      } catch (error) {
        logger.error('Error calculating match for asset', {
          assetId: asset.id,
          investorId: investorUserId,
          error,
        });
      }
    }

    // Sort by score descending and return top matches
    return matches
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, limit);
  }

  /**
   * Create match record in database
   */
  static async createMatchRecord(
    tenantId: string,
    investorUserId: string,
    auctionAssetId: string,
    profileId: string,
    matchScore: MatchScore
  ): Promise<MatchRecord> {
    const result = await db.query<MatchRecord>(
      `INSERT INTO match_records 
       (tenant_id, investor_user_id, auction_asset_id, investor_preference_profile_id,
        match_score, budget_score, risk_score, asset_type_score, location_score,
        property_characteristics_score, roi_score, match_algorithm_version, match_details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        tenantId,
        investorUserId,
        auctionAssetId,
        profileId,
        matchScore.overall_score,
        matchScore.budget_score,
        matchScore.risk_score,
        matchScore.asset_type_score,
        matchScore.location_score,
        matchScore.property_characteristics_score,
        matchScore.roi_score,
        '1.0', // Algorithm version
        JSON.stringify(matchScore.breakdown),
      ]
    );

    return result.rows[0];
  }

  /**
   * Check and auto-notify investors for high-scoring matches
   */
  static async checkAndAutoNotify(
    tenantId: string,
    investorUserId: string
  ): Promise<{ notified: number; matches: MatchRecord[] }> {
    // Get investor profile
    const profile = await InvestorPreferenceProfileModel.findByInvestorId(investorUserId, tenantId);
    if (!profile || !profile.auto_notify_enabled) {
      return { notified: 0, matches: [] };
    }

    // Get matches above threshold
    const threshold = profile.notification_threshold;
    const result = await db.query<MatchRecord>(
      `SELECT * FROM match_records
       WHERE tenant_id = $1
         AND investor_user_id = $2
         AND match_score >= $3
         AND is_auto_notified = false
         AND match_status = 'PENDING'
       ORDER BY match_score DESC
       LIMIT 10`,
      [tenantId, investorUserId, threshold]
    );

    const matches = result.rows;
    let notified = 0;

    for (const match of matches) {
      try {
        // Send notification (placeholder - would integrate with notification service)
        await this.sendMatchNotification(tenantId, investorUserId, match, profile.notification_channels);

        // Mark as notified
        await db.query(
          `UPDATE match_records 
           SET is_auto_notified = true,
               notification_sent_at = CURRENT_TIMESTAMP,
               notification_channel = $1,
               match_status = 'NOTIFIED'
           WHERE id = $2`,
          [profile.notification_channels[0] || 'email', match.id]
        );

        notified++;
      } catch (error) {
        logger.error('Failed to send match notification', {
          matchId: match.id,
          investorId: investorUserId,
          error,
        });
      }
    }

    return { notified, matches };
  }

  /**
   * Send match notification (placeholder - integrate with notification service)
   */
  private static async sendMatchNotification(
    tenantId: string,
    investorUserId: string,
    match: MatchRecord,
    channels: string[]
  ): Promise<void> {
    // Placeholder - would integrate with email/SMS/push notification service
    logger.info('Sending match notification', {
      tenantId,
      investorUserId,
      matchId: match.id,
      score: match.match_score,
      channels,
    });
  }
}
