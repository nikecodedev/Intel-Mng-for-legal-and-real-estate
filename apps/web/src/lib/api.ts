/**
 * API client for document viewer.
 * Viewer access requires tenant_id + RBAC; the API expects Bearer token from auth.
 * When NEXT_PUBLIC_API_URL is unset, uses same-origin + /api/v1 (works with reverse proxy or same host).
 */
const getApiBase = (): string => {
  if (typeof window === 'undefined') return '';
  const envUrl = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/$/, '');
  if (envUrl) return envUrl;
  const origin = window.location.origin;
  return `${origin}/api/v1`;
};

/** Token for API calls. Set by auth flow (e.g. login) in sessionStorage or cookie. */
export function getViewerToken(): string {
  if (typeof window === 'undefined') return '';
  return (
    sessionStorage.getItem('auth_token') ||
    localStorage.getItem('auth_token') ||
    ''
  );
}

export function getViewerHeaders(): HeadersInit {
  const token = getViewerToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function fetchViewerContext(
  documentId: string,
  factId?: string | null
): Promise<{
  watermark: { user_email: string; user_id: string; ip_address: string; timestamp: string };
  fact_context: { page_number: number; bounding_box: { x: number; y: number; width: number; height: number } } | null;
}> {
  const base = getApiBase();
  const url = factId
    ? `${base}/documents/${documentId}/viewer-context?fact_id=${encodeURIComponent(factId)}`
    : `${base}/documents/${documentId}/viewer-context`;
  const res = await fetch(url, { headers: getViewerHeaders() });
  if (!res.ok) throw new Error(`Viewer context failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function fetchViewerAssetBlob(documentId: string): Promise<Blob> {
  const base = getApiBase();
  const res = await fetch(`${base}/documents/${documentId}/viewer-asset`, {
    headers: getViewerHeaders(),
  });
  if (!res.ok) throw new Error(`Viewer asset failed: ${res.status}`);
  return res.blob();
}

export { getApiBase };
