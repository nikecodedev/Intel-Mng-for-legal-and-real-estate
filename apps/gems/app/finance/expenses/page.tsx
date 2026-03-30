'use client';
import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { api } from '@/lib/api';

// OCR extraction: parse R$ value and DD/MM/YYYY date from document facts
function extractFromFacts(facts: Array<{ fact_type: string; fact_value: string }>): { amount?: string; date?: string } {
  let amount: string | undefined;
  let date: string | undefined;
  for (const f of facts) {
    if (f.fact_type === 'monetary_value' && !amount) {
      const match = String(f.fact_value).match(/[\d.,]+/);
      if (match) amount = match[0].replace(/\./g, '').replace(',', '.');
    }
    if (f.fact_type === 'date' && !date) {
      const match = String(f.fact_value).match(/(\d{4})-(\d{2})-(\d{2})/);
      if (match) date = match[0];
    }
  }
  return { amount, date };
}

export default function ExpenseCaptureFormPage() {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [success, setSuccess] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Zero Footprint: clear all client-side data on unmount
  useEffect(() => {
    return () => {
      // Clear sessionStorage/localStorage expense data
      try { sessionStorage.removeItem('expense_draft'); } catch {}
      try { localStorage.removeItem('expense_draft'); } catch {}
      // Revoke any blob URLs
      if (typeof window !== 'undefined') {
        try { caches.delete('expense-receipts').catch(() => {}); } catch {}
      }
    };
  }, []);

  const [scannedDocId, setScannedDocId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Step 1: Upload receipt + OCR → pre-fill form
  const handleScanReceipt = async () => {
    if (!receiptFile) return;
    setScanning(true);
    setOcrStatus('Uploading receipt...');
    try {
      const form = new FormData();
      form.append('file', receiptFile);
      form.append('title', `Receipt - ${description || 'Expense'}`);
      form.append('document_type', 'OTHER');
      const uploadRes = await api.post('/documents/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      const docId = uploadRes.data?.data?.id;
      if (docId) {
        setScannedDocId(docId);
        setOcrStatus('Extracting data from receipt (OCR)...');
        // Wait for OCR processing
        await new Promise(r => setTimeout(r, 4000));
        const factsRes = await api.get(`/documents/${docId}/facts`);
        const facts = factsRes.data?.data ?? factsRes.data ?? [];
        if (Array.isArray(facts) && facts.length > 0) {
          const extracted = extractFromFacts(facts);
          // Pre-fill form with extracted data
          if (extracted.amount) setAmount(extracted.amount);
          setOcrStatus(`OCR pre-filled: ${extracted.amount ? `R$ ${extracted.amount}` : 'no value'}, ${extracted.date || 'no date'}`);
        } else {
          setOcrStatus('Receipt uploaded. No values extracted — fill manually.');
        }
      }
    } catch (e) {
      setOcrStatus(`Upload failed: ${e instanceof Error ? e.message : 'error'}`);
    } finally {
      setScanning(false);
    }
  };

  // Step 2: Submit expense (with or without scanned receipt)
  const mutation = useMutation({
    mutationFn: async () => {
      const amountCents = Math.round(Number(parseFloat(amount || '0').toFixed(2)) * 100);
      if (amountCents <= 0) throw new Error('Enter a valid amount');

      return api.post('/finance/expenses', {
        amount_cents: amountCents,
        currency: 'BRL',
        description: description.trim(),
        vendor_name: vendor.trim() || undefined,
        captured_via: 'MOBILE',
        proof_document_id: scannedDocId || undefined,
        transaction_date: new Date().toLocaleDateString('en-CA'),
      });
    },
    onSuccess: () => {
      setSuccess(true);
      setOcrStatus(null);

      // === ZERO FOOTPRINT: Complete client-side cleanup ===
      setAmount('');
      setDescription('');
      setVendor('');
      setReceiptFile(null);
      // Reset file input DOM element
      if (fileInputRef.current) fileInputRef.current.value = '';
      // Clear all storage
      try { sessionStorage.clear(); } catch {}
      try { localStorage.removeItem('expense_draft'); } catch {}
      // Clear all browser caches related to expenses
      if (typeof window !== 'undefined' && 'caches' in window) {
        try { caches.keys().then(keys => keys.forEach(k => { if (k.includes('expense') || k.includes('receipt')) caches.delete(k); })); } catch {}
      }
      // Clear IndexedDB if available
      if (typeof window !== 'undefined' && 'indexedDB' in window) {
        try { indexedDB.deleteDatabase('expense-receipts'); } catch {}
      }
      queryClient.invalidateQueries('finance-transactions');
    },
  });

  return (
    <div className="max-w-lg space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Capture Expense</h2>
      <p className="text-sm text-gray-500">Quick expense entry with receipt photo OCR.</p>

      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount (BRL) *</label>
          <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" required placeholder="0.00" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" required placeholder="e.g. Taxi to cartório" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
          <input type="text" value={vendor} onChange={(e) => setVendor(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Uber, Cartório 15" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Receipt photo</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            capture="environment"
            onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700"
          />
          <p className="mt-1 text-xs text-gray-400">Take a photo or select a file. Click "Scan Receipt" to extract value automatically.</p>
          {receiptFile && !scannedDocId ? (
            <button
              type="button"
              onClick={handleScanReceipt}
              disabled={scanning}
              className="mt-2 rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {scanning ? 'Scanning...' : 'Scan Receipt (OCR)'}
            </button>
          ) : null}
          {scannedDocId ? (
            <p className="mt-1 text-xs text-green-600">Receipt uploaded and scanned.</p>
          ) : null}
        </div>

        {ocrStatus ? <p className="text-sm text-blue-600">{ocrStatus}</p> : null}
        {mutation.isError ? <p className="text-sm text-red-600">{(mutation.error as Error)?.message || 'Error'}</p> : null}
        {success ? (
          <div className="rounded-md bg-green-50 border border-green-200 p-3">
            <p className="text-sm text-green-700 font-medium">Expense captured successfully!</p>
            <p className="text-xs text-green-600 mt-1">All local data has been cleared (Zero Footprint).</p>
          </div>
        ) : null}

        <button
          onClick={() => { setSuccess(false); setOcrStatus(null); mutation.mutate(); }}
          disabled={mutation.isLoading || !amount || !description}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 w-full"
        >
          {mutation.isLoading ? 'Processing...' : 'Capture Expense'}
        </button>
      </div>

      <div className="rounded-md bg-gray-50 border border-gray-200 p-3">
        <p className="text-xs text-gray-500"><strong>Zero Footprint:</strong> All expense data, receipt photos, and cached files are automatically cleared from this device after submission. No data persists locally.</p>
      </div>
    </div>
  );
}
