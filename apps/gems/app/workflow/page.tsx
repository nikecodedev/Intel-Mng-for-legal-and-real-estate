'use client';

import { useEffect, useState } from 'react';
import { api, getApiErrorMessage, isApiError } from '@/lib/api';

interface WorkflowTask {
  id: string;
  task_type: string;
  title: string;
  description: string | null;
  status: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  trigger_id: string | null;
  created_at: string;
}

type StatusGroup = 'pending' | 'in_progress' | 'completed' | 'cancelled';

const STATUS_LABELS: Record<StatusGroup, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<StatusGroup, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

export default function WorkflowTasksPage() {
  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
  }, []);

  async function fetchTasks() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/workflow/tasks');
      const items: WorkflowTask[] = data?.data?.tasks ?? data?.data ?? [];
      setTasks(items);
    } catch (err) {
      if (isApiError(err)) {
        setError(getApiErrorMessage(err));
      } else {
        setError('Failed to load workflow tasks');
      }
    } finally {
      setLoading(false);
    }
  }

  async function updateTaskStatus(taskId: string, newStatus: string) {
    try {
      await api.patch(`/workflow/tasks/${taskId}`, { status: newStatus });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
    } catch (err) {
      if (isApiError(err)) {
        setError(getApiErrorMessage(err));
      }
    }
  }

  const grouped = tasks.reduce<Record<StatusGroup, WorkflowTask[]>>(
    (acc, task) => {
      const key = (task.status as StatusGroup) || 'pending';
      if (!acc[key]) acc[key] = [];
      acc[key].push(task);
      return acc;
    },
    { pending: [], in_progress: [], completed: [], cancelled: [] }
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-700 text-sm">
        {error}
        <button onClick={fetchTasks} className="ml-3 underline">
          Retry
        </button>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        No workflow tasks found.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {(['pending', 'in_progress', 'completed', 'cancelled'] as StatusGroup[]).map((status) => {
        const items = grouped[status];
        if (!items || items.length === 0) return null;
        return (
          <section key={status}>
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status]}`}
              >
                {STATUS_LABELS[status]}
              </span>
              <span className="text-sm text-gray-500 font-normal">
                ({items.length})
              </span>
            </h2>
            <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
              {items.map((task) => (
                <div key={task.id} className="p-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900 truncate">
                        {task.title}
                      </h3>
                      <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                        {task.task_type}
                      </span>
                    </div>
                    {task.description && (
                      <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                        {task.description}
                      </p>
                    )}
                    <div className="mt-2 flex gap-3 text-xs text-gray-400">
                      {task.related_entity_type && (
                        <span>
                          {task.related_entity_type}
                          {task.related_entity_id
                            ? `: ${task.related_entity_id.slice(0, 8)}...`
                            : ''}
                        </span>
                      )}
                      <span>
                        Created{' '}
                        {new Date(task.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {status === 'pending' && (
                      <button
                        onClick={() => updateTaskStatus(task.id, 'in_progress')}
                        className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                      >
                        Start
                      </button>
                    )}
                    {status === 'in_progress' && (
                      <button
                        onClick={() => updateTaskStatus(task.id, 'completed')}
                        className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100"
                      >
                        Complete
                      </button>
                    )}
                    {(status === 'pending' || status === 'in_progress') && (
                      <button
                        onClick={() => updateTaskStatus(task.id, 'cancelled')}
                        className="px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
