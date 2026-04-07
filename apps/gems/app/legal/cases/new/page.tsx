'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, getApiErrorMessage } from '@/lib/api';

interface CaseForm {
  case_number: string;
  title: string;
  client_name: string;
  description: string;
  deadline: string;
  assigned_lawyer_id: string;
}

export default function NewCasePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CaseForm>({
    case_number: '',
    title: '',
    client_name: '',
    description: '',
    deadline: '',
    assigned_lawyer_id: '',
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string> = {
        case_number: form.case_number.trim(),
        title: form.title.trim(),
      };
      if (form.client_name.trim()) payload.client_name = form.client_name.trim();
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.deadline) payload.deadline = form.deadline;
      if (form.assigned_lawyer_id.trim()) payload.assigned_lawyer_id = form.assigned_lawyer_id.trim();

      const { data } = await api.post('/legal-cases', payload);
      return data?.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries('legal-cases');
      router.push(`/legal/cases/${data?.id ?? ''}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.reset();
    mutation.mutate();
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Novo Processo</h2>
        <Link href="/legal/cases" className="text-sm text-blue-600 hover:underline">
          ← Voltar
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        {mutation.isError && (
          <div className="rounded-md bg-red-50 p-4 text-red-800 text-sm" role="alert">
            <p className="font-medium">{getApiErrorMessage(mutation.error)}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Numero do Processo *</label>
            <input
              type="text"
              value={form.case_number}
              onChange={(e) => setForm((f) => ({ ...f, case_number: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titulo *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Cliente</label>
          <input
            type="text"
            value={form.client_name}
            onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descricao</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prazo</label>
            <input
              type="date"
              value={form.deadline}
              onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Advogado Responsavel (ID)</label>
            <input
              type="text"
              value={form.assigned_lawyer_id}
              onChange={(e) => setForm((f) => ({ ...f, assigned_lawyer_id: e.target.value }))}
              placeholder="UUID"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={mutation.isLoading}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isLoading ? 'Criando...' : 'Criar Processo'}
          </button>
          <Link
            href="/legal/cases"
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
