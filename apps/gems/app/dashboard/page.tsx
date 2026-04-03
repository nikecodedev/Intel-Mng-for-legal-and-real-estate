'use client';

import { useQuery } from 'react-query';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import {
  fetchDocumentsTotal,
  fetchSanitationPending,
  fetchActiveAuctionsCount,
  fetchAssetsInRenovation,
  fetchPendingFinancialApprovals,
} from '@/lib/dashboard-api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area,
} from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function DashboardPage() {
  const { user } = useAuth();

  const docs = useQuery('dash-docs', fetchDocumentsTotal, { staleTime: 60_000, retry: 1 });
  const sanit = useQuery('dash-sanit', fetchSanitationPending, { staleTime: 60_000, retry: 1 });
  const auctions = useQuery('dash-auctions', fetchActiveAuctionsCount, { staleTime: 60_000, retry: 1 });
  const reno = useQuery('dash-reno', fetchAssetsInRenovation, { staleTime: 60_000, retry: 1 });
  const payables = useQuery('dash-payables', fetchPendingFinancialApprovals, { staleTime: 60_000, retry: 1 });

  // Fetch transactions for financial chart
  const txQuery = useQuery('dash-transactions', async () => {
    const res = await api.get('/finance/transactions', { params: { limit: 100 } });
    return res.data?.transactions ?? [];
  }, { staleTime: 60_000, retry: false });

  // Fetch workflow tasks for status chart
  const tasksQuery = useQuery('dash-tasks', async () => {
    const res = await api.get('/workflow/tasks');
    return res.data?.data?.tasks ?? res.data?.data ?? [];
  }, { staleTime: 60_000, retry: false });

  // Fetch real estate assets for state chart
  const assetsQuery = useQuery('dash-assets', async () => {
    const res = await api.get('/assets', { params: { limit: 200 } });
    return res.data?.assets ?? [];
  }, { staleTime: 60_000, retry: false });

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  })();

  const displayName = user?.first_name?.trim() || null;

  // Prepare chart data
  const statCards = [
    { label: 'Documentos', value: docs.data ?? 0, color: '#3B82F6', icon: '📄' },
    { label: 'Saneamento', value: sanit.data ?? 0, color: '#F59E0B', icon: '⚠️' },
    { label: 'Leilões Ativos', value: auctions.data ?? 0, color: '#10B981', icon: '🔨' },
    { label: 'Em Reforma', value: reno.data ?? 0, color: '#8B5CF6', icon: '🏗️' },
    { label: 'Aprovações', value: payables.data ?? 0, color: '#EF4444', icon: '💰' },
  ];

  // Transaction monthly summary
  const txMonthly = (() => {
    const months: Record<string, { receita: number; despesa: number }> = {};
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    for (const tx of txQuery.data ?? []) {
      const d = new Date(tx.transaction_date);
      const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      if (!months[key]) months[key] = { receita: 0, despesa: 0 };
      const amt = (tx.amount_cents ?? 0) / 100;
      if (tx.transaction_type === 'RECEIVABLE' || tx.transaction_type === 'INCOME') {
        months[key].receita += amt;
      } else {
        months[key].despesa += amt;
      }
    }
    return Object.entries(months).map(([name, v]) => ({ name, ...v })).slice(-6);
  })();

  // Asset state distribution for pie chart
  const assetStates = (() => {
    const states: Record<string, number> = {};
    for (const a of assetsQuery.data ?? []) {
      const s = a.current_state || 'OUTRO';
      states[s] = (states[s] || 0) + 1;
    }
    return Object.entries(states).map(([name, value]) => ({ name, value }));
  })();

  // Task status distribution
  const taskStatus = (() => {
    const statuses: Record<string, number> = {};
    for (const t of tasksQuery.data ?? []) {
      const s = t.status || 'pending';
      const labels: Record<string, string> = { pending: 'Pendente', in_progress: 'Em Andamento', completed: 'Concluído', cancelled: 'Cancelado' };
      statuses[labels[s] || s] = (statuses[labels[s] || s] || 0) + 1;
    }
    return Object.entries(statuses).map(([name, value]) => ({ name, value }));
  })();

  // Payment status for bar chart
  const paymentStatus = (() => {
    const statuses: Record<string, number> = {};
    for (const tx of txQuery.data ?? []) {
      const s = tx.payment_status || 'PENDING';
      const labels: Record<string, string> = { PENDING: 'Pendente', PAID: 'Pago', PARTIAL: 'Parcial', OVERDUE: 'Vencido', CANCELLED: 'Cancelado' };
      statuses[labels[s] || s] = (statuses[labels[s] || s] || 0) + 1;
    }
    return Object.entries(statuses).map(([name, count]) => ({ name, count }));
  })();

  return (
    <DashboardLayout title="Painel">
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting}{displayName ? `, ${displayName}` : ''}
        </h1>
        <p className="text-sm text-gray-500 mt-1">Aqui está o resumo da sua plataforma.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: card.color + '15', color: card.color }}>{card.label}</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Financial Overview - Area Chart */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Fluxo Financeiro</h3>
          {txMonthly.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={txMonthly}>
                <defs>
                  <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorDespesa" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={((v: unknown) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`) as any} />
                <Area type="monotone" dataKey="receita" name="Receita" stroke="#10B981" fill="url(#colorReceita)" strokeWidth={2} />
                <Area type="monotone" dataKey="despesa" name="Despesa" stroke="#EF4444" fill="url(#colorDespesa)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-sm text-gray-400">Sem dados financeiros</div>
          )}
        </div>

        {/* Asset States - Pie Chart */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Imóveis por Estado</h3>
          {assetStates.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={assetStates} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value" label={((e: any) => `${e.name} (${e.value})`) as any}>
                  {assetStates.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-sm text-gray-400">Sem dados de imóveis</div>
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Status - Bar Chart */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Transações por Situação</h3>
          {paymentStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={paymentStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="Transações" radius={[6, 6, 0, 0]}>
                  {paymentStatus.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-sm text-gray-400">Sem transações</div>
          )}
        </div>

        {/* Task Status - Donut + Line */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Tarefas do Fluxo</h3>
          {taskStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={taskStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value" label={((e: any) => `${e.name}: ${e.value}`) as any}>
                  {taskStatus.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-sm text-gray-400">Sem tarefas</div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
