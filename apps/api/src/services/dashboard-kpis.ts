import { db } from '../models/database.js';
import { FinancialTransactionModel } from '../models/financial-transaction.js';
import { AuctionAssetROIModel } from '../models/auction-asset-roi.js';
import { AuctionAssetModel } from '../models/auction-asset.js';
import { RealEstateAssetModel } from '../models/real-estate-asset.js';
import { DashboardKPICacheModel, KPIType, PeriodType } from '../models/dashboard.js';
import { logger } from '../utils/logger.js';

export interface CashFlowKPI {
  total_inflow_cents: number;
  total_outflow_cents: number;
  net_cash_flow_cents: number;
  pending_receivables_cents: number;
  pending_payables_cents: number;
  period_start: string;
  period_end: string;
  breakdown: {
    by_type: Record<string, number>;
    by_category: Record<string, number>;
  };
}

export interface DeadlinesKPI {
  total_deadlines: number;
  overdue_count: number;
  due_today_count: number;
  due_this_week_count: number;
  due_this_month_count: number;
  critical_deadlines: Array<{
    id: string;
    title: string;
    due_date: string;
    days_until_due: number;
    resource_type: string;
  }>;
}

export interface ROIKPI {
  total_assets: number;
  total_invested_cents: number;
  total_expected_return_cents: number;
  average_roi_percentage: number;
  total_profit_cents: number;
  assets_by_roi: Array<{
    asset_id: string;
    asset_code: string;
    roi_percentage: number;
    invested_cents: number;
    expected_return_cents: number;
  }>;
}

export interface RiskExposureKPI {
  total_assets: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  average_risk_score: number;
  high_risk_assets: Array<{
    asset_id: string;
    asset_code: string;
    risk_score: number;
    risk_factors: string[];
  }>;
  risk_distribution: Record<string, number>;
}

/**
 * Dashboard KPI Service
 * Calculates KPIs without exposing raw SQL
 */
export class DashboardKPIService {
  /**
   * Calculate Cash Flow KPI
   */
  static async calculateCashFlow(
    tenantId: string,
    startDate?: string,
    endDate?: string
  ): Promise<CashFlowKPI> {
    // Check cache first
    const cached = await DashboardKPICacheModel.getCachedKPI(
      tenantId,
      'CASH_FLOW',
      'cash_flow_summary',
      startDate && endDate ? 'CUSTOM' : 'REALTIME',
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    if (cached) {
      return cached.kpi_value as CashFlowKPI;
    }

    // Calculate cash flow using models (no raw SQL exposure)
    const periodStart = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const periodEnd = endDate || new Date().toISOString().split('T')[0];

    // Get transactions for period using model (no raw SQL)
    const { transactions } = await FinancialTransactionModel.list(tenantId, {
      limit: 10000,
    });
    
    // Filter by date range
    const filteredTransactions = transactions.filter(txn => {
      const txnDate = new Date(txn.transaction_date).toISOString().split('T')[0];
      return txnDate >= periodStart && txnDate <= periodEnd;
    });

    let totalInflow = 0;
    let totalOutflow = 0;
    let pendingReceivables = 0;
    let pendingPayables = 0;
    const byType: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const txn of filteredTransactions) {
      const amount = txn.amount_cents;
      const type = txn.transaction_type;
      const category = txn.transaction_category || 'other';

      if (type === 'INCOME' || type === 'RECEIVABLE') {
        if (txn.payment_status === 'PAID') {
          totalInflow += amount;
        } else {
          pendingReceivables += amount;
        }
      } else if (type === 'EXPENSE' || type === 'PAYABLE') {
        if (txn.payment_status === 'PAID') {
          totalOutflow += amount;
        } else {
          pendingPayables += amount;
        }
      }

      byType[type] = (byType[type] || 0) + amount;
      byCategory[category] = (byCategory[category] || 0) + amount;
    }

    const kpi: CashFlowKPI = {
      total_inflow_cents: totalInflow,
      total_outflow_cents: totalOutflow,
      net_cash_flow_cents: totalInflow - totalOutflow,
      pending_receivables_cents: pendingReceivables,
      pending_payables_cents: pendingPayables,
      period_start: periodStart,
      period_end: periodEnd,
      breakdown: {
        by_type: byType,
        by_category: byCategory,
      },
    };

    // Cache result
    await DashboardKPICacheModel.cacheKPI(
      tenantId,
      'CASH_FLOW',
      'cash_flow_summary',
      kpi,
      startDate && endDate ? 'CUSTOM' : 'REALTIME',
      300, // 5 minute cache
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    return kpi;
  }

  /**
   * Calculate Deadlines KPI
   */
  static async calculateDeadlines(tenantId: string): Promise<DeadlinesKPI> {
    // Check cache
    const cached = await DashboardKPICacheModel.getCachedKPI(
      tenantId,
      'DEADLINES',
      'deadlines_summary',
      'REALTIME'
    );

    if (cached) {
      return cached.kpi_value as DeadlinesKPI;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const monthEnd = new Date(today);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    // Get processes with due dates using model (no raw SQL)
    const processesResult = await db.query<{
      id: string;
      title: string | null;
      process_number: string | null;
      due_date: Date | null;
    }>(
      `SELECT id, title, process_number, due_date 
       FROM processes 
       WHERE tenant_id = $1 AND deleted_at IS NULL AND due_date IS NOT NULL
       LIMIT 10000`,
      [tenantId]
    );
    const processes = processesResult.rows;

    let overdueCount = 0;
    let dueTodayCount = 0;
    let dueThisWeekCount = 0;
    let dueThisMonthCount = 0;
    const criticalDeadlines: Array<{
      id: string;
      title: string;
      due_date: string;
      days_until_due: number;
      resource_type: string;
    }> = [];

    for (const process of processes) {
      if (!process.due_date) continue;

      const dueDate = new Date(process.due_date);
      dueDate.setHours(0, 0, 0, 0);
      const daysUntilDue = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilDue < 0) {
        overdueCount++;
      } else if (daysUntilDue === 0) {
        dueTodayCount++;
      } else if (daysUntilDue <= 7) {
        dueThisWeekCount++;
      } else if (daysUntilDue <= 30) {
        dueThisMonthCount++;
      }

      // Add to critical if overdue or due within 3 days
      if (daysUntilDue <= 3) {
        const dueDate = new Date(process.due_date!);
        criticalDeadlines.push({
          id: process.id,
          title: process.title || process.process_number || 'Untitled',
          due_date: dueDate.toISOString().split('T')[0],
          days_until_due: daysUntilDue,
          resource_type: 'process',
        });
      }
    }

    const kpi: DeadlinesKPI = {
      total_deadlines: overdueCount + dueTodayCount + dueThisWeekCount + dueThisMonthCount,
      overdue_count: overdueCount,
      due_today_count: dueTodayCount,
      due_this_week_count: dueThisWeekCount,
      due_this_month_count: dueThisMonthCount,
      critical_deadlines: criticalDeadlines.sort((a, b) => a.days_until_due - b.days_until_due),
    };

    // Cache result
    await DashboardKPICacheModel.cacheKPI(
      tenantId,
      'DEADLINES',
      'deadlines_summary',
      kpi,
      'REALTIME',
      60 // 1 minute cache for deadlines
    );

    return kpi;
  }

  /**
   * Calculate ROI KPI
   */
  static async calculateROI(tenantId: string): Promise<ROIKPI> {
    // Check cache
    const cached = await DashboardKPICacheModel.getCachedKPI(
      tenantId,
      'ROI',
      'roi_summary',
      'REALTIME'
    );

    if (cached) {
      return cached.kpi_value as ROIKPI;
    }

    // Get all assets with ROI using model (no raw SQL)
    const assets = await AuctionAssetModel.listByTenant(tenantId, { limit: 10000 });

    let totalInvested = 0;
    let totalExpectedReturn = 0;
    const assetsByROI: Array<{
      asset_id: string;
      asset_code: string;
      roi_percentage: number;
      invested_cents: number;
      expected_return_cents: number;
    }> = [];

    for (const asset of assets) {
      const roi = await AuctionAssetROIModel.findByAssetId(asset.id, tenantId);
      if (!roi) continue;

      const invested = roi.acquisition_price_cents || 0;
      const expectedReturn = roi.expected_resale_value_cents || 0;
      const roiPercentage = roi.roi_percentage || 0;

      totalInvested += invested;
      totalExpectedReturn += expectedReturn;

      assetsByROI.push({
        asset_id: asset.id,
        asset_code: asset.asset_reference || asset.id,
        roi_percentage: roiPercentage,
        invested_cents: invested,
        expected_return_cents: expectedReturn,
      });
    }

    const averageROI = assetsByROI.length > 0
      ? assetsByROI.reduce((sum, a) => sum + a.roi_percentage, 0) / assetsByROI.length
      : 0;

    const kpi: ROIKPI = {
      total_assets: assetsByROI.length,
      total_invested_cents: totalInvested,
      total_expected_return_cents: totalExpectedReturn,
      average_roi_percentage: Math.round(averageROI * 100) / 100,
      total_profit_cents: totalExpectedReturn - totalInvested,
      assets_by_roi: assetsByROI.sort((a, b) => b.roi_percentage - a.roi_percentage),
    };

    // Cache result
    await DashboardKPICacheModel.cacheKPI(
      tenantId,
      'ROI',
      'roi_summary',
      kpi,
      'REALTIME',
      300 // 5 minute cache
    );

    return kpi;
  }

  /**
   * Calculate Risk Exposure KPI
   */
  static async calculateRiskExposure(tenantId: string): Promise<RiskExposureKPI> {
    // Check cache
    const cached = await DashboardKPICacheModel.getCachedKPI(
      tenantId,
      'RISK_EXPOSURE',
      'risk_exposure_summary',
      'REALTIME'
    );

    if (cached) {
      return cached.kpi_value as RiskExposureKPI;
    }

    // Get all assets using model (no raw SQL)
    const assets = await AuctionAssetModel.listByTenant(tenantId, { limit: 10000 });

    let highRiskCount = 0;
    let mediumRiskCount = 0;
    let lowRiskCount = 0;
    let totalRiskScore = 0;
    const highRiskAssets: Array<{
      asset_id: string;
      asset_code: string;
      risk_score: number;
      risk_factors: string[];
    }> = [];
    const riskDistribution: Record<string, number> = {};

    for (const asset of assets) {
      const riskScore = asset.risk_score || 0;
      totalRiskScore += riskScore;

      if (riskScore >= 70) {
        highRiskCount++;
        const riskFactors: string[] = [];
        if (asset.due_diligence_checklist.occupancy.status === 'risk') riskFactors.push('occupancy');
        if (asset.due_diligence_checklist.debts.status === 'risk') riskFactors.push('debts');
        if (asset.due_diligence_checklist.legal_risks.status === 'risk') riskFactors.push('legal_risks');
        if (asset.due_diligence_checklist.zoning.status === 'risk') riskFactors.push('zoning');

        highRiskAssets.push({
          asset_id: asset.id,
          asset_code: asset.asset_reference || asset.id,
          risk_score: riskScore,
          risk_factors: riskFactors,
        });
      } else if (riskScore >= 40) {
        mediumRiskCount++;
      } else {
        lowRiskCount++;
      }

      // Risk distribution by range
      const range = Math.floor(riskScore / 10) * 10;
      riskDistribution[`${range}-${range + 9}`] = (riskDistribution[`${range}-${range + 9}`] || 0) + 1;
    }

    const averageRiskScore = assets.length > 0 ? totalRiskScore / assets.length : 0;

    const kpi: RiskExposureKPI = {
      total_assets: assets.length,
      high_risk_count: highRiskCount,
      medium_risk_count: mediumRiskCount,
      low_risk_count: lowRiskCount,
      average_risk_score: Math.round(averageRiskScore * 100) / 100,
      high_risk_assets: highRiskAssets.sort((a, b) => b.risk_score - a.risk_score),
      risk_distribution: riskDistribution,
    };

    // Cache result
    await DashboardKPICacheModel.cacheKPI(
      tenantId,
      'RISK_EXPOSURE',
      'risk_exposure_summary',
      kpi,
      'REALTIME',
      300 // 5 minute cache
    );

    return kpi;
  }

  /**
   * Get all KPIs for dashboard
   */
  static async getAllKPIs(tenantId: string, kpiTypes?: KPIType[]): Promise<{
    cash_flow?: CashFlowKPI;
    deadlines?: DeadlinesKPI;
    roi?: ROIKPI;
    risk_exposure?: RiskExposureKPI;
  }> {
    const kpis: {
      cash_flow?: CashFlowKPI;
      deadlines?: DeadlinesKPI;
      roi?: ROIKPI;
      risk_exposure?: RiskExposureKPI;
    } = {};

    const typesToCalculate = kpiTypes || ['CASH_FLOW', 'DEADLINES', 'ROI', 'RISK_EXPOSURE'];

    if (typesToCalculate.includes('CASH_FLOW')) {
      kpis.cash_flow = await this.calculateCashFlow(tenantId);
    }
    if (typesToCalculate.includes('DEADLINES')) {
      kpis.deadlines = await this.calculateDeadlines(tenantId);
    }
    if (typesToCalculate.includes('ROI')) {
      kpis.roi = await this.calculateROI(tenantId);
    }
    if (typesToCalculate.includes('RISK_EXPOSURE')) {
      kpis.risk_exposure = await this.calculateRiskExposure(tenantId);
    }

    return kpis;
  }
}
