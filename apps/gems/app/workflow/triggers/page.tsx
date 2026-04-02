'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
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
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showEmit, setShowEmit] = useState(false);

  // Create form state
  const [createForm, setCreateForm] = useState({ name: '', event_type: '', condition: '{}', action_type: 'create_task', action_config: '{}' });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  // Emit form state
  const [emitEventType, setEmitEventType] = useState('');
  const [emitPayload, setEmitPayload] = useState('{}');
  const [emitLoading, setEmitLoading] = useState(false);
  const [emitResult, setEmitResult] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery(
    'workflow-triggers',
    async () => {
      const res = await api.get('/workflow/triggers');
      const body = res.data?.data ?? res.data;
      return (body?.triggers ?? body ?? []) as WorkflowTrigger[];
    },
    { staleTime: 60_000, retry: 1 }
  );

  const toggleMutation = useMutation(
    async ({ id, active }: { id: string; active: boolean }) => {
      await api.patch(`/workflow/triggers/${id}`, { is_active: active });
    },
    { onSuccess: () => { queryClient.invalidateQueries('workflow-triggers'); } }
  );

  const triggers = data ?? [];
  const selected = selectedId ? triggers.find(t => t.id === selectedId) : null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateLoading(true); setCreateError('');
    try {
      await api.post('/workflow/triggers', {
        name: createForm.name,
        event_type: createForm.event_type,
        condition: JSON.parse(createForm.condition),
        action_type: createForm.action_type,
        action_config: JSON.parse(createForm.action_config),
      });
      setShowCreate(false);
      setCreateForm({ name: '', event_type: '', condition: '{}', action_type: 'create_task', action_config: '{}' });
      queryClient.invalidateQueries('workflow-triggers');
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || 'Failed to create trigger.');
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleEmit(e: React.FormEvent) {
    e.preventDefault();
    setEmitLoading(true); setEmitResult(null);
    try {
      const { data } = await api.post('/workflow/emit', { event_type: emitEventType, payload: JSON.parse(emitPayload) });
      setEmitResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setEmitResult(`Error: ${err?.response?.data?.message || err?.message}`);
    } finally {
      setEmitLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Workflow Triggers</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowEmit(!showEmit)} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Emit Event</button>
          <button onClick={() => setShowCreate(!showCreate)} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Create Trigger</button>
        </div>
      </div>

      {/* Create Trigger Form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
          <h3 className="text-sm font-medium text-blue-800">New Workflow Trigger</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Name</label>
              <input value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm" placeholder="Trigger name" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Event Type</label>
              <input value={createForm.event_type} onChange={e => setCreateForm(p => ({ ...p, event_type: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm" placeholder="e.g. finance.transaction.paid" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Action Type</label>
              <select value={createForm.action_type} onChange={e => setCreateForm(p => ({ ...p, action_type: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm">
                <option value="create_task">Create Task</option>
                <option value="send_notification">Send Notification</option>
                <option value="block_transition">Block Transition</option>
                <option value="update_state">Update State</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Condition (JSON)</label>
              <input value={createForm.condition} onChange={e => setCreateForm(p => ({ ...p, condition: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Action Config (JSON)</label>
            <textarea value={createForm.action_config} onChange={e => setCreateForm(p => ({ ...p, action_config: e.target.value }))} rows={2} className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm font-mono" />
          </div>
          {createError && <p className="text-sm text-red-600">{createError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={createLoading} className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{createLoading ? 'Creating...' : 'Create'}</button>
            <button type="button" onClick={() => setShowCreate(false)} className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700">Cancel</button>
          </div>
        </form>
      )}

      {/* Emit Debug Event Form */}
      {showEmit && (
        <form onSubmit={handleEmit} className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-800">Emit Debug Event</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Event Type</label>
              <input value={emitEventType} onChange={e => setEmitEventType(e.target.value)} required className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm" placeholder="e.g. finance.transaction.paid" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Payload (JSON)</label>
              <input value={emitPayload} onChange={e => setEmitPayload(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm font-mono" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={emitLoading} className="rounded bg-gray-700 px-4 py-1.5 text-sm text-white hover:bg-gray-800 disabled:opacity-50">{emitLoading ? 'Emitting...' : 'Emit'}</button>
            <button type="button" onClick={() => setShowEmit(false)} className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700">Cancel</button>
          </div>
          {emitResult && <pre className="text-xs bg-white border border-gray-200 rounded p-3 overflow-x-auto max-h-40">{emitResult}</pre>}
        </form>
      )}

      {isLoading ? <p className="text-sm text-gray-500">Loading triggers...</p> : null}
      {isError ? <p className="text-sm text-red-600">Failed to load triggers.</p> : null}

      {!isLoading && !isError && triggers.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">No workflow triggers configured.</div>
      ) : null}

      {triggers.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Event</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Action</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Condition</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {triggers.map((t) => (
                <tr key={t.id} className={`hover:bg-gray-50 cursor-pointer ${selectedId === t.id ? 'bg-blue-50' : ''}`} onClick={() => setSelectedId(selectedId === t.id ? null : t.id)}>
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name || t.id.slice(0, 8)}</td>
                  <td className="px-4 py-3"><code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{t.event_type}</code></td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${t.action_type === 'block_transition' ? 'bg-red-100 text-red-700' : t.action_type === 'create_task' ? 'bg-blue-100 text-blue-700' : t.action_type === 'update_state' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{t.action_type}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono max-w-xs truncate">{JSON.stringify(t.condition)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleMutation.mutate({ id: t.id, active: !t.is_active }); }}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${t.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${t.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Trigger Detail */}
      {selected && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-3">
          <h3 className="text-sm font-medium text-gray-500">Trigger Detail</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-600">ID</dt><dd className="font-mono text-xs">{selected.id}</dd>
            <dt className="text-gray-600">Name</dt><dd className="font-medium">{selected.name}</dd>
            <dt className="text-gray-600">Event</dt><dd><code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{selected.event_type}</code></dd>
            <dt className="text-gray-600">Action</dt><dd className="font-medium">{selected.action_type}</dd>
            <dt className="text-gray-600">Active</dt><dd>{selected.is_active ? 'Yes' : 'No'}</dd>
            <dt className="text-gray-600">Created</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd>
          </dl>
          <div>
            <h4 className="text-xs font-medium text-gray-500 mb-1">Condition</h4>
            <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto">{JSON.stringify(selected.condition, null, 2)}</pre>
          </div>
          <div>
            <h4 className="text-xs font-medium text-gray-500 mb-1">Action Config</h4>
            <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto">{JSON.stringify(selected.action_config, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
