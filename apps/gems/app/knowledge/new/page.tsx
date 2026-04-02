'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

const ENTRY_TYPES = ['LEGAL_THESIS', 'CASE_OUTCOME', 'LEGAL_PRECEDENT', 'LEGAL_OPINION'];

export default function CreateKnowledgeEntryPage() {
  const router = useRouter();
  const [form, setForm] = useState({ entry_type: 'LEGAL_THESIS', title: '', summary: '', content: '', category: '', tags: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.post('/knowledge/entries', {
        ...form,
        tags: form.tags ? form.tags.split(',').map(s => s.trim()) : [],
      });
      router.push('/knowledge');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create entry.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">New Knowledge Entry</h1>
        <Link href="/knowledge" className="text-sm text-blue-600 hover:underline">Cancel</Link>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
      <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Type</label>
            <select value={form.entry_type} onChange={e => setForm(p => ({ ...p, entry_type: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              {ENTRY_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Category</label>
            <input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Title</label>
          <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Summary</label>
          <textarea value={form.summary} onChange={e => setForm(p => ({ ...p, summary: e.target.value }))} rows={2} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Content</label>
          <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} required rows={6} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Tags (comma-separated)</label>
          <input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="real-estate, legal, ITBI" />
        </div>
        <button type="submit" disabled={loading} className="w-full rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{loading ? 'Creating...' : 'Create Entry'}</button>
      </form>
    </div>
  );
}
