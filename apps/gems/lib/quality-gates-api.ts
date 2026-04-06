/**
 * Quality Gates API module.
 */

import { api } from '@/lib/api';

export interface QualityGate {
  id: string;
  gate_code: string;
  gate_name: string;
  description: string | null;
  gate_type: string;
  gate_category: string | null;
  is_blocking: boolean;
  is_mandatory: boolean;
  is_active: boolean;
  failure_action: string | null;
  priority: number | null;
  created_at: string;
}

export async function fetchQualityGates(params?: { gate_type?: string; limit?: number; offset?: number }): Promise<{ gates: QualityGate[]; total: number }> {
  const res = await api.get('/quality-gates', { params: { limit: 50, offset: 0, ...params } });
  return { gates: res.data?.gates ?? [], total: res.data?.total ?? 0 };
}

export async function fetchQualityGateById(id: string): Promise<QualityGate> {
  const res = await api.get(`/quality-gates/${id}`);
  return res.data?.gate ?? res.data?.data ?? res.data;
}

export async function fetchQualityGateByCode(code: string): Promise<QualityGate> {
  const res = await api.get(`/quality-gates/code/${encodeURIComponent(code)}`);
  return res.data?.gate ?? res.data?.data ?? res.data;
}

export async function createQualityGate(input: Record<string, unknown>): Promise<QualityGate> {
  const res = await api.post('/quality-gates', input);
  return res.data?.gate ?? res.data?.data ?? res.data;
}

export async function checkQualityGate(body: { resource_type: string; resource_id: string }): Promise<any> {
  const res = await api.post('/quality-gates/check', body);
  return res.data?.validation ?? res.data?.data ?? res.data;
}

export async function canProceed(body: { resource_type: string; resource_id: string }): Promise<any> {
  const res = await api.post('/quality-gates/can-proceed', body);
  return res.data?.data ?? res.data;
}

export async function fetchChecks(resourceType: string, resourceId: string): Promise<any[]> {
  const res = await api.get(`/quality-gates/checks/${resourceType}/${resourceId}`);
  return res.data?.checks ?? res.data?.data ?? [];
}

export async function fetchDecisions(resourceType: string, resourceId: string, params?: { limit?: number; offset?: number }): Promise<any[]> {
  const res = await api.get(`/quality-gates/decisions/${resourceType}/${resourceId}`, { params });
  return res.data?.decisions ?? res.data?.data ?? [];
}
