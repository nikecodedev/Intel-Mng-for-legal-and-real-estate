'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { fetchViewerContext, fetchViewerAssetBlob } from '@/lib/legal-api';

export default function LegalDocumentViewPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [pages, setPages] = useState<string[]>([]);
  const [watermark, setWatermark] = useState<{ user_email: string; user_id: string; ip_address: string; timestamp: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const renderPdfToCanvas = useCallback(async (pdfData: ArrayBuffer, wm: string) => {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';

      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      setTotalPages(pdf.numPages);
      const rendered: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const scale = 1.5;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        await page.render({ canvasContext: ctx, viewport }).promise;

        // Forensic watermark burned into canvas pixels
        if (wm) {
          ctx.save();
          ctx.globalAlpha = 0.06;
          ctx.font = '16px sans-serif';
          ctx.fillStyle = '#000';
          ctx.translate(viewport.width / 2, viewport.height / 2);
          ctx.rotate(-Math.PI / 6);
          for (let j = -12; j <= 12; j++) {
            ctx.fillText(wm, -viewport.width / 2, j * 60);
          }
          ctx.restore();
        }

        rendered.push(canvas.toDataURL('image/png'));
      }

      setPages(rendered);
    } catch (err) {
      setError(`Failed to render PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [ctxResult, blobResult] = await Promise.allSettled([
          fetchViewerContext(id),
          fetchViewerAssetBlob(id),
        ]);

        if (blobResult.status === 'rejected') {
          throw blobResult.reason instanceof Error ? blobResult.reason : new Error('Failed to load document');
        }

        let wmText = '';
        if (ctxResult.status === 'fulfilled') {
          setWatermark(ctxResult.value.watermark);
          const w = ctxResult.value.watermark;
          wmText = `CONFIDENCIAL — ${w.user_email} | ${w.user_id} | ${w.ip_address} | ${new Date(w.timestamp).toLocaleString()}`;
        }

        if (!cancelled) {
          const arrayBuffer = await blobResult.value.arrayBuffer();
          await renderPdfToCanvas(arrayBuffer, wmText);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load document');
          setLoading(false);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, renderPdfToCanvas]);

  // Block Ctrl+S, Ctrl+P globally
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 's' || e.key === 'p' || e.key === 'S' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

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

  const wmText = watermark
    ? `CONFIDENCIAL — ${watermark.user_email} | ${watermark.user_id} | ${watermark.ip_address} | ${new Date(watermark.timestamp).toLocaleString()}`
    : '';

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-2">
        <Link href={`/legal/documents/${id}`} className="text-sm text-blue-600 hover:underline">
          ← Back to document
        </Link>
        <div className="flex items-center gap-3">
          {totalPages > 0 ? <span className="text-xs text-gray-500">{totalPages} page(s)</span> : null}
          <span className="text-xs text-green-600 font-medium">Secure Canvas Viewer — No download</span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 rounded-lg border border-gray-200 bg-gray-800 overflow-y-auto"
        onContextMenu={(e) => e.preventDefault()}
        style={{ userSelect: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}
      >
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-3" />
              <p className="text-white/60 text-sm">Rendering document securely...</p>
            </div>
          </div>
        ) : null}

        {pages.map((src, i) => (
          <div key={i} className="flex justify-center py-2">
            <img
              src={src}
              alt={`Page ${i + 1}`}
              className="max-w-full shadow-lg"
              style={{ userSelect: 'none', pointerEvents: 'none' } as React.CSSProperties}
              draggable={false}
            />
          </div>
        ))}

        {wmText ? (
          <div className="sticky bottom-0 left-0 right-0 py-1.5 px-4 bg-black/70 text-white/80 text-xs text-center z-10">
            {wmText}
          </div>
        ) : null}
      </div>
    </div>
  );
}
