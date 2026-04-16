'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

type ViewerContext = {
  watermark: {
    user_email: string;
    user_id: string;
    ip_address: string;
    timestamp: string;
    tenant_id?: string;  // Spec §2.5 — tenant_id obrigatório na marca d'água
  };
  fact_context: {
    page_number: number;
    bounding_box: { x: number; y: number; width: number; height: number };
  } | null;
};

type DocumentViewerProps = {
  documentId: string;
  factId?: string | null;
  fetchContext: (docId: string, fid?: string | null) => Promise<ViewerContext>;
  fetchAsset: (docId: string) => Promise<Blob>;
};

export function DocumentViewer({
  documentId,
  factId,
  fetchContext,
  fetchAsset,
}: DocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<ViewerContext | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pdfDataRef = useRef<{ arrayBuffer: ArrayBuffer } | null>(null);

  // Disable download, print, copy
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    const preventCopy = (e: ClipboardEvent) => e.preventDefault();
    const preventPrint = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', prevent);
    document.addEventListener('copy', preventCopy);
    document.addEventListener('cut', preventCopy);
    window.addEventListener('beforeprint', preventPrint);
    return () => {
      document.removeEventListener('contextmenu', prevent);
      document.removeEventListener('copy', preventCopy);
      document.removeEventListener('cut', preventCopy);
      window.removeEventListener('beforeprint', preventPrint);
    };
  }, []);

  const renderPages = useCallback(
    async (arrayBuffer: ArrayBuffer, factContext: ViewerContext['fact_context']) => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const total = pdf.numPages;
      const scale = 1.5;

      for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRefs.current.get(i);
        if (!canvas) continue;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;

        if (factContext && factContext.page_number === i) {
          const b = factContext.bounding_box;
          const x = (b.x ?? 0) * viewport.width;
          const y = (b.y ?? 0) * viewport.height;
          const w = (b.width ?? 0.2) * viewport.width;
          const h = (b.height ?? 0.05) * viewport.height;
          ctx.strokeStyle = 'rgba(255, 200, 0, 0.9)';
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = 'rgba(255, 200, 0, 0.15)';
          ctx.fillRect(x, y, w, h);
        }
      }
    },
    []
  );

  // Load context + PDF and determine page count
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setNumPages(0);
      pdfDataRef.current = null;
      try {
        const [ctx, blob] = await Promise.all([
          fetchContext(documentId, factId),
          fetchAsset(documentId),
        ]);
        if (cancelled) return;
        setContext(ctx);
        const arrayBuffer = await blob.arrayBuffer();
        if (cancelled) return;
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;
        pdfDataRef.current = { arrayBuffer };
        setNumPages(pdf.numPages);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load document');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, factId, fetchContext, fetchAsset]);

  // Once we have numPages and context, canvases are in DOM; render PDF into them
  useEffect(() => {
    if (numPages <= 0 || !context || !pdfDataRef.current) return;
    renderPages(pdfDataRef.current.arrayBuffer, context.fact_context);
  }, [numPages, context, renderPages]);

  if (loading) {
    return (
      <div className="viewer-loading" style={{ padding: 24, textAlign: 'center' }}>
        Loading document…
      </div>
    );
  }
  if (error) {
    return (
      <div className="viewer-error" style={{ padding: 24, color: 'crimson' }}>
        {error}
      </div>
    );
  }

  // Spec §2.5 / Divergência #14: watermark must include tenant_id
  const watermarkText = context
    ? [
        context.watermark.user_email,
        context.watermark.user_id,
        context.watermark.ip_address,
        context.watermark.timestamp,
        context.watermark.tenant_id,  // §2.5 — tenant_id obrigatório na marca d'água
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <>
      <style>{`
        @media print {
          .document-viewer .viewer-pages,
          .document-viewer .viewer-watermark { visibility: hidden !important; }
          .viewer-print-block { display: flex !important; visibility: visible !important; position: fixed; inset: 0; background: #fff; align-items: center; justify-content: center; font-size: 24px; color: #333; }
        }
        .viewer-print-block { display: none; }
      `}</style>
      <div className="viewer-print-block" aria-hidden>
        Printing is disabled. This document is confidential.
      </div>
      <div
        ref={containerRef}
        className="document-viewer"
        style={{
        position: 'relative',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        overflow: 'auto',
        background: '#1a1a1a',
        minHeight: 400,
      }}
    >
      {/* Watermark overlay - dynamic: user email, user id, IP, timestamp */}
      {watermarkText && (
        <div
          className="viewer-watermark"
          aria-hidden
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
            zIndex: 1,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '-50%',
              top: '-50%',
              width: '200%',
              height: '200%',
              display: 'flex',
              flexWrap: 'wrap',
              alignContent: 'space-around',
              justifyContent: 'space-around',
              transform: 'rotate(-30deg)',
            }}
          >
            {Array.from({ length: 50 }).map((_, i) => (
              <span
                key={i}
                style={{
                  fontSize: 14,
                  color: 'rgba(255,255,255,0.15)',  // Spec §2.5: opacity 0.15 (was 0.08)
                  whiteSpace: 'nowrap',
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                {watermarkText}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* PDF pages - canvases created so refs exist before renderPages runs */}
      <div
        className="viewer-pages"
        style={{
          position: 'relative',
          zIndex: 0,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        {numPages > 0 &&
          Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <div key={pageNum} style={{ position: 'relative', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
              <canvas
                ref={(el) => {
                  if (el) canvasRefs.current.set(pageNum, el);
                }}
                data-page={pageNum}
                style={{ display: 'block', background: '#fff' }}
              />
            </div>
          ))}
      </div>
    </div>
    </>
  );
}
