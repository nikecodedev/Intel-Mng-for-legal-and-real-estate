'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function CreateTemplatePage() {
  const router = useRouter();
  const [form, setForm] = useState({ template_name: '', template_type: 'PETITION', description: '', template_content: '', category: '', tags: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.post('/knowledge/templates', { ...form, tags: form.tags ? form.tags.split(',').map(s => s.trim()) : [] });
      router.push('/knowledge/templates');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao criar modelo.');
    } finally { setLoading(false); }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Novo Modelo de Documento</h1>
        <Link href="/knowledge/templates" className="text-sm text-blue-600 hover:underline">Cancelar</Link>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
      <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-xs text-gray-600 mb-1">Nome</label><input value={form.template_name} onChange={e => setForm(p => ({ ...p, template_name: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs text-gray-600 mb-1">Tipo</label><select value={form.template_type} onChange={e => setForm(p => ({ ...p, template_type: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm"><option value="PETITION">Petição</option><option value="LEGAL_DOCUMENT">Documento Legal</option><option value="CHECKLIST">Checklist</option></select></div>
        </div>
        <div><label className="block text-xs text-gray-600 mb-1">Descrição</label><textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
        <div><label className="block text-xs text-gray-600 mb-1">Conteúdo do Modelo</label><textarea value={form.template_content} onChange={e => setForm(p => ({ ...p, template_content: e.target.value }))} required rows={8} className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-xs text-gray-600 mb-1">Categoria</label><input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs text-gray-600 mb-1">Tags (separadas por vírgula)</label><input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
        </div>
        <button type="submit" disabled={loading} className="w-full rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{loading ? 'Criando...' : 'Criar Modelo'}</button>
      </form>
    </div>
  );
}
