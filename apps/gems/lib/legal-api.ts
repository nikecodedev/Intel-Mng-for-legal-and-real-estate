/**
 * Legal module API: documents, sanitation queue, facts, viewer.
 * All validation and rule enforcement is on the backend.
 */

import { api, getApiErrorMessage } from '@/lib/api';

export { getApiErrorMessage };

// Types (align with backend responses)
export interface DocumentListItem {
  id: string;
  document_number: string;
  title: string;
  description?: string | null;
  document_type: string;
  file_name?: string | null;
  status: string;
  status_cpo: 'VERDE' | 'AMARELO' | 'VERMELHO' | null;
  ocr_processed?: boolean;
  ocr_confidence?: number | null;
  created_at: string;
  updated_at?: string;
}

export interface DocumentsListResponse {
  success: boolean;
  data: {
    documents: DocumentListItem[];
    pagination: { total: number; limit: number; offset: number };
  };
}

export interface DocumentDetailResponse {
  success: boolean;
  data: {
    document: DocumentListItem & { file_size?: number; mime_type?: string; dpi_resolution?: number | null };
    extraction: {
      id: string;
      document_id: string;
      process_number?: string | null;
      court?: string | null;
      parties?: unknown;
      monetary_values?: unknown;
      overall_confidence?: number | null;
      processed_at?: string | null;
    } | null;
    quality_flags: QualityFlag[];
  };
}

export interface QualityFlag {
  id: string;
  document_id: string;
  flag_type: string;
  severity: string;
  flag_message: string;
  queue_status: string;
  queued_at: string;
}

export interface SanitationQueueItem {
  flag_id: string;
  document_id: string;
  document_number: string;
  document_title: string;
  file_name: string;
  status_cpo: string | null;
  flag_type: string;
  severity: string;
  flag_message: string;
  queue_status: string;
  queued_at: string;
}

export interface SanitationQueueResponse {
  success: boolean;
  data: {
    items: SanitationQueueItem[];
    pagination: { total: number; limit: number; offset: number };
  };
}

export interface DocumentFact {
  id: string;
  document_id: string;
  fact_type: string;
  fact_value: unknown;
  page_number: number | null;
  confidence_score: number | null;
  created_at: string;
}

export interface DocumentFactsResponse {
  success: boolean;
  data: DocumentFact[];
}

export interface ViewerContextResponse {
  success: boolean;
  data: {
    watermark: { user_email: string; user_id: string; ip_address: string; timestamp: string };
    fact_context: { page_number: number; bounding_box: { x: number; y: number; width: number; height: number } } | null;
  };
}

export interface UploadResponse {
  success: boolean;
  data: {
    id: string;
    document_number: string;
    title: string;
    status: string;
    status_cpo: string | null;
    file_name: string;
    file_size?: number;
    created_at: string;
    processing: string;
  };
}

export async function fetchDocuments(params: { limit?: number; offset?: number; status_cpo?: string } = {}): Promise<DocumentsListResponse> {
  const { data } = await api.get<DocumentsListResponse>('/documents', { params });
  return data;
}

export async function fetchDocumentById(id: string): Promise<DocumentDetailResponse> {
  const { data } = await api.get<DocumentDetailResponse>(`/documents/${id}`);
  return data;
}

export async function fetchDocumentFacts(documentId: string): Promise<DocumentFact[]> {
  const { data } = await api.get<{ success: boolean; data: DocumentFact[] }>(`/documents/${documentId}/facts`);
  return data?.data ?? [];
}

export async function fetchSanitationQueue(params: { limit?: number; offset?: number } = {}): Promise<SanitationQueueResponse> {
  const { data } = await api.get<SanitationQueueResponse>('/documents/sanitation-queue', { params });
  return data;
}

export async function resolveFlag(flagId: string, body: { resolution_action: string; resolution_notes?: string }): Promise<void> {
  await api.post(`/documents/sanitation-queue/${flagId}/resolve`, body);
}

export async function escalateFlag(flagId: string, body: { notes?: string } = {}): Promise<void> {
  await api.post(`/documents/sanitation-queue/${flagId}/escalate`, body);
}

export async function uploadDocument(
  formData: FormData,
  onProgress?: (percent: number) => void
): Promise<UploadResponse['data']> {
  const { data } = await api.post<UploadResponse>('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
    onUploadProgress: (e) => {
      if (e.total && e.total > 0 && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    },
  });
  if (!data?.success || !data.data) throw new Error('Invalid upload response');
  return data.data;
}

/** Viewer: fetch context (watermark) from API. */
export async function fetchViewerContext(documentId: string, factId?: string | null): Promise<ViewerContextResponse['data']> {
  const url = factId
    ? `/documents/${documentId}/viewer-context?fact_id=${encodeURIComponent(factId)}`
    : `/documents/${documentId}/viewer-context`;
  const { data } = await api.get<ViewerContextResponse>(url);
  if (!data?.success || !data.data) throw new Error('Failed to load viewer context');
  return data.data;
}

/** Fetch viewer asset as blob with auth (for embedded viewer; no download URL). */
export async function fetchViewerAssetBlob(documentId: string): Promise<Blob> {
  const res = await api.get<Blob>(`/documents/${documentId}/viewer-asset`, {
    responseType: 'blob',
  });
  return res.data;
}
