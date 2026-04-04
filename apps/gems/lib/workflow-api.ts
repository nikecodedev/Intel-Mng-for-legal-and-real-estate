/**
 * Workflow API: tarefas, triggers e eventos.
 */

import { api } from '@/lib/api';

export interface WorkflowTask {
  id: string;
  tenant_id: string;
  trigger_id: string | null;
  title: string;
  description: string | null;
  status: string;
  assigned_to: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowTrigger {
  id: string;
  tenant_id: string;
  name: string | null;
  event_type: string;
  condition: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTriggerInput {
  name?: string;
  event_type: string;
  condition: Record<string, unknown>;
  action_type: 'create_task' | 'send_notification' | 'block_transition' | 'update_state';
  action_config?: Record<string, unknown>;
}

export interface EmitEventInput {
  event_type: string;
  payload?: Record<string, unknown>;
}

/** Listar tarefas do tenant */
export async function fetchTasks(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ tasks: WorkflowTask[]; total: number }> {
  const res = await api.get('/workflow/tasks', { params });
  const d = res.data?.data ?? res.data;
  return { tasks: d?.tasks ?? [], total: d?.total ?? 0 };
}

/** Atualizar status de uma tarefa */
export async function updateTaskStatus(
  taskId: string,
  status: string
): Promise<WorkflowTask> {
  const res = await api.patch(`/workflow/tasks/${taskId}`, { status });
  return (res.data?.data ?? res.data?.task ?? res.data) as WorkflowTask;
}

/** Listar triggers do tenant */
export async function fetchTriggers(params?: {
  event_type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ triggers: WorkflowTrigger[]; total: number }> {
  const res = await api.get('/workflow/triggers', { params });
  const d = res.data?.data ?? res.data;
  return { triggers: d?.triggers ?? [], total: d?.total ?? 0 };
}

/** Criar novo trigger */
export async function createTrigger(input: CreateTriggerInput): Promise<WorkflowTrigger> {
  const res = await api.post('/workflow/triggers', input);
  return (res.data?.data ?? res.data?.trigger ?? res.data) as WorkflowTrigger;
}

/** Ativar/desativar trigger */
export async function toggleTrigger(
  triggerId: string,
  isActive: boolean
): Promise<WorkflowTrigger> {
  const res = await api.patch(`/workflow/triggers/${triggerId}`, { is_active: isActive });
  return (res.data?.data ?? res.data?.trigger ?? res.data) as WorkflowTrigger;
}

/** Buscar trigger por ID */
export async function fetchTriggerById(triggerId: string): Promise<WorkflowTrigger> {
  const res = await api.get(`/workflow/triggers/${triggerId}`);
  return (res.data?.data ?? res.data?.trigger ?? res.data) as WorkflowTrigger;
}

/** Emitir evento para acionar triggers */
export async function emitEvent(input: EmitEventInput): Promise<{ triggered: number }> {
  const res = await api.post('/workflow/emit', input);
  return (res.data?.data ?? res.data) as { triggered: number };
}
