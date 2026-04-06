/**
 * Knowledge API module — entries, templates, search.
 */

import { api } from '@/lib/api';

// ── Entries ──

export async function fetchEntries(params?: { entry_type?: string; limit?: number; offset?: number }): Promise<{ entries: any[]; total: number }> {
  const res = await api.get('/knowledge/entries', { params: { limit: 50, offset: 0, ...params } });
  return { entries: res.data?.entries ?? [], total: res.data?.total ?? 0 };
}

export async function fetchEntryById(id: string): Promise<any> {
  const res = await api.get(`/knowledge/entries/${id}`);
  return res.data?.entry ?? res.data?.data ?? res.data;
}

export async function createEntry(input: Record<string, unknown>): Promise<any> {
  const res = await api.post('/knowledge/entries', input);
  return res.data?.entry ?? res.data?.data ?? res.data;
}

// ── Search ──

export async function searchKnowledge(query: string, limit = 50): Promise<any[]> {
  const res = await api.post('/knowledge/search', { query, limit });
  return res.data?.results ?? [];
}

export async function searchPastCases(query: string, limit = 50): Promise<any[]> {
  const res = await api.post('/knowledge/search/past-cases', { query, limit });
  return res.data?.results ?? res.data?.entries ?? [];
}

export async function searchOutcomes(query: string, limit = 50): Promise<any[]> {
  const res = await api.post('/knowledge/search/outcomes', { query, limit });
  return res.data?.results ?? [];
}

// ── Templates ──

export async function fetchTemplates(params?: { template_type?: string; limit?: number; offset?: number }): Promise<{ templates: any[]; total: number }> {
  const res = await api.get('/knowledge/templates', { params: { limit: 50, offset: 0, ...params } });
  return { templates: res.data?.templates ?? [], total: res.data?.total ?? 0 };
}

export async function fetchRecommendedTemplates(limit = 10): Promise<any[]> {
  const res = await api.get('/knowledge/templates/recommended', { params: { limit } });
  return res.data?.templates ?? [];
}

export async function fetchTemplateById(id: string): Promise<any> {
  const res = await api.get(`/knowledge/templates/${id}`);
  return res.data?.template ?? res.data?.data ?? res.data;
}

export async function createTemplate(input: Record<string, unknown>): Promise<any> {
  const res = await api.post('/knowledge/templates', input);
  return res.data?.template ?? res.data?.data ?? res.data;
}

export async function recordTemplateUse(templateId: string, body?: Record<string, unknown>): Promise<void> {
  await api.post(`/knowledge/templates/${templateId}/use`, body ?? {});
}

export async function recordTemplateOutcome(templateId: string, body: { outcome_type: string; outcome_notes?: string }): Promise<void> {
  await api.post(`/knowledge/templates/${templateId}/outcome`, body);
}

export async function fetchTemplateMetrics(templateId: string): Promise<any> {
  const res = await api.get(`/knowledge/templates/${templateId}/metrics`);
  return res.data?.metrics ?? res.data?.data ?? null;
}
