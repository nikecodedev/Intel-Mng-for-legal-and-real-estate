'use client';

import { useQuery } from 'react-query';
import { api } from '@/lib/api';

interface WorkflowTrigger {
  id: string;
  name: string;
  event_type: string;
  condition: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export default function WorkflowTriggersPage() {
  const { data, isLoading, isError } = useQuery(
    'workflow-triggers',
    async () => {
      const res = await api.get('/workflow/triggers');
      const body = res.data?.data ?? res.data;
      return (body?.triggers ?? body ?? []) as WorkflowTrigger[];
    },
    { staleTime: 60_000, retry: 1 }
  );

  const triggers = data ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Workflow Triggers</h2>

      {isLoading ? <p className="text-sm text-gray-500">Loading triggers...</p> : null}
      {isError ? <p className="text-sm text-red-600">Failed to load triggers.</p> : null}

      {!isLoading && !isError && triggers.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          No workflow triggers configured.
        </div>
      ) : null}

      {triggers.length > 0 ? (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Event</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Action</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Condition</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {triggers.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name || t.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{t.event_type}</code>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      t.action_type === 'block_transition' ? 'bg-red-100 text-red-700' :
                      t.action_type === 'create_task' ? 'bg-blue-100 text-blue-700' :
                      t.action_type === 'update_state' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {t.action_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono max-w-xs truncate">
                    {JSON.stringify(t.condition)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      t.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
