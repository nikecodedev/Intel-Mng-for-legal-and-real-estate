'use client';

import { useQuery } from 'react-query';
import { api } from '@/lib/api';
import { DateDisplay, BlockLoader } from '@/components/ui';

interface OverrideEvent {
  id: string;
  user_id: string;
  user_email: string;
  override_type: string;
  target_entity: string;
  target_id: string;
  otp_verified: boolean;
  reason: string | null;
  created_at: string;
}

async function fetchOverrides() {
  const { data } = await api.get<{ success: boolean; data: { events: OverrideEvent[] } }>('/admin/overrides');
  return data?.data?.events ?? [];
}

export default function OverridesPage() {
  const { data: events, isLoading, error } = useQuery(
    'admin-overrides',
    fetchOverrides,
    { staleTime: 30_000 }
  );

  if (isLoading) return <BlockLoader message="Carregando eventos de override..." />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Eventos de Override</h2>
        <p className="text-sm text-gray-500">Registro de todas as acoes de override com verificacao OTP</p>
      </div>

      {error || !events?.length ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          Nenhum evento de override registrado.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entidade</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">OTP Verificado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Motivo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {events.map((ev) => (
                <tr key={ev.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{ev.user_email}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                      {ev.override_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {ev.target_entity} <span className="text-gray-400 text-xs">({ev.target_id.slice(0, 8)}...)</span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {ev.otp_verified ? (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Sim</span>
                    ) : (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Nao</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{ev.reason || '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    <DateDisplay value={ev.created_at} style="short" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
