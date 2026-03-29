'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { api } from '@/lib/api';

export default function ExpenseCaptureFormPage() {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const amountCents = Math.round(Number(parseFloat(amount || '0').toFixed(2)) * 100);
      if (amountCents <= 0) throw new Error('Enter a valid amount');

      // If receipt file, upload first
      let proofDocId: string | undefined;
      if (receiptFile) {
        const form = new FormData();
        form.append('file', receiptFile);
        form.append('title', `Receipt - ${description || 'Expense'}`);
        form.append('document_type', 'OTHER');
        const uploadRes = await api.post('/documents/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        });
        proofDocId = uploadRes.data?.data?.id;
      }

      return api.post('/finance/expenses', {
        amount_cents: amountCents,
        currency: 'BRL',
        description: description.trim(),
        vendor_name: vendor.trim() || undefined,
        captured_via: 'MOBILE',
        proof_document_id: proofDocId,
        transaction_date: new Date().toISOString().slice(0, 10),
      });
    },
    onSuccess: () => {
      setSuccess(true);
      setAmount('');
      setDescription('');
      setVendor('');
      setReceiptFile(null);
      queryClient.invalidateQueries('finance-transactions');
    },
  });

  return (
    <div className="max-w-lg space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Capture Expense</h2>
      <p className="text-sm text-gray-500">Quick expense entry with optional receipt photo.</p>

      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount (BRL) *</label>
          <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" required placeholder="0.00" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" required placeholder="e.g. Taxi to cartorio" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
          <input type="text" value={vendor} onChange={(e) => setVendor(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Uber, Cartorio 15" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Receipt photo (optional)</label>
          <input type="file" accept="image/*,.pdf" capture="environment" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700" />
        </div>
        {mutation.isError ? <p className="text-sm text-red-600">{(mutation.error as Error)?.message || 'Error'}</p> : null}
        {success ? <p className="text-sm text-green-600">Expense captured successfully!</p> : null}
        <button onClick={() => { setSuccess(false); mutation.mutate(); }} disabled={mutation.isLoading || !amount || !description} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 w-full">
          {mutation.isLoading ? 'Saving...' : 'Capture Expense'}
        </button>
      </div>
    </div>
  );
}
