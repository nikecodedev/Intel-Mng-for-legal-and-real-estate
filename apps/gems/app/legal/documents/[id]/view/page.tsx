'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchViewerContext, fetchViewerAssetBlob } from '@/lib/legal-api';

export default function LegalDocumentViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [watermark, setWatermark] = useState<{ user_email: string; user_id: string; ip_address: string; timestamp: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    const load = async () => {
      try {
        const [ctx, blob] = await Promise.all([
          fetchViewerContext(id),
          fetchViewerAssetBlob(id),
        ]);
        setWatermark(ctx.watermark);
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load document');
      }
    };
    load();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="text-red-700">{error}</p>
        <Link href={`/legal/documents/${id}`} className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          ← Back to document
        </Link>
      </div>
    );
  }

  const w = watermark;
  const watermarkText = w
    ? `Confidential — ${w.user_email} | ${w.user_id} | ${w.ip_address} | ${new Date(w.timestamp).toLocaleString()}`
    : '';

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-2">
        <Link href={`/legal/documents/${id}`} className="text-sm text-blue-600 hover:underline">
          ← Back to document
        </Link>
        <span className="text-xs text-gray-500">Secure viewer — no download</span>
      </div>
      <div className="relative flex-1 min-h-0 rounded-lg border border-gray-200 bg-gray-100 overflow-hidden">
        {blobUrl && (
          <iframe
            src={blobUrl}
            title="Document"
            className="absolute inset-0 w-full h-full border-0"
          />
        )}
        {!blobUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            Loading document…
          </div>
        )}
        {/* Frontend-only watermark overlay (backend secures the file) */}
        <div
          className="absolute bottom-0 left-0 right-0 py-2 px-4 bg-black/70 text-white/90 text-xs text-center pointer-events-none select-none"
          aria-hidden
        >
          {watermarkText || 'Loading…'}
        </div>
      </div>
    </div>
  );
}
