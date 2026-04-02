'use client';

import { useEffect, useState } from 'react';
import { api, getApiErrorMessage, isApiError } from '@/lib/api';

interface QualityGate {
  id: string;
  gate_code: string;
  gate_name: string;
  description: string | null;
  gate_type: string;
  gate_category: string | null;
  is_blocking: boolean;
  is_mandatory: boolean;
  is_active: boolean;
  failure_action: string | null;
  priority: number | null;
  created_at: string;
}

interface CheckResult {
  all_passed: boolean;
  blocking_failures: Array<{ gate_code: string; gate_name: string; reason: string }>;
  workflow_blocked: boolean;
}

const GATE_TYPES = ['DOCUMENT', 'APPROVAL', 'RISK_SCORE', 'CUSTOM', 'DATA_COMPLETENESS', 'VALIDATION'];

const TYPE_COLORS: Record<string, string> = {
  DOCUMENT: 'bg-blue-100 text-blue-800',
  APPROVAL: 'bg-green-100 text-green-800',
  RISK_SCORE: 'bg-red-100 text-red-800',
  CUSTOM: 'bg-purple-100 text-purple-800',
  DATA_COMPLETENESS: 'bg-amber-100 text-amber-800',
  VALIDATION: 'bg-cyan-100 text-cyan-800',
};

export default function QualityGatesPage() {
  const [gates, setGates] = useState<QualityGate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState('');
  const [selectedGate, setSelectedGate] = useState<QualityGate | null>(null);
  const [checkResourceType, setCheckResourceType] = useState('PROCESS');
  const [checkResourceId, setCheckResourceId] = useState('');
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    fetchGates();
  }, [filterType]);

  async function fetchGates() {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { limit: 50, offset: 0 };
      if (filterType) params.gate_type = filterType;
      const { data } = await api.get('/quality-gates', { params });
      setGates(data?.gates ?? []);
      setTotal(data?.total ?? 0);
    } catch (err) {
      setError(isApiError(err) ? getApiErrorMessage(err) : 'Failed to load quality gates');
    } finally {
      setLoading(false);
    }
  }

  async function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    if (!checkResourceId.trim()) return;
    setChecking(true);
    setError(null);
    setCheckResult(null);
    try {
      const { data } = await api.post('/quality-gates/check', {
        resource_type: checkResourceType,
        resource_id: checkResourceId,
      });
      setCheckResult(data?.validation ?? null);
    } catch (err) {
      setError(isApiError(err) ? getApiErrorMessage(err) : 'Gate check failed');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Quality Gates</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Filter + Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">{total} gates</p>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">All types</option>
          {GATE_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {/* Gates Table */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : gates.length === 0 ? (
        <p className="text-sm text-gray-500">No quality gates found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Blocking</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mandatory</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Active</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failure Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {gates.map((gate) => (
                <tr
                  key={gate.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedGate(selectedGate?.id === gate.id ? null : gate)}
                >
                  <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">{gate.gate_code}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{gate.gate_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLORS[gate.gate_type] ?? 'bg-gray-100 text-gray-700'}`}>
                      {gate.gate_type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{gate.is_blocking ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3 text-sm">{gate.is_mandatory ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-block w-2 h-2 rounded-full ${gate.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{gate.failure_action ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Gate Detail */}
      {selectedGate && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-2">{selectedGate.gate_code} — {selectedGate.gate_name}</h2>
          <p className="text-sm text-gray-600 mb-4">{selectedGate.description ?? 'No description.'}</p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-gray-500">Type</dt><dd className="font-medium">{selectedGate.gate_type}</dd>
            <dt className="text-gray-500">Category</dt><dd className="font-medium">{selectedGate.gate_category ?? '-'}</dd>
            <dt className="text-gray-500">Blocking</dt><dd className="font-medium">{selectedGate.is_blocking ? 'Yes' : 'No'}</dd>
            <dt className="text-gray-500">Mandatory</dt><dd className="font-medium">{selectedGate.is_mandatory ? 'Yes' : 'No'}</dd>
            <dt className="text-gray-500">Priority</dt><dd className="font-medium">{selectedGate.priority ?? '-'}</dd>
            <dt className="text-gray-500">Created</dt><dd className="font-medium">{new Date(selectedGate.created_at).toLocaleDateString()}</dd>
          </dl>
        </div>
      )}

      {/* Gate Check */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Test Gate Check</h2>
        <form onSubmit={handleCheck} className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Resource Type</label>
            <select
              value={checkResourceType}
              onChange={(e) => setCheckResourceType(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="PROCESS">Process</option>
              <option value="AUCTION_ASSET">Auction Asset</option>
              <option value="REAL_ESTATE_ASSET">Real Estate Asset</option>
              <option value="DOCUMENT">Document</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Resource ID</label>
            <input
              type="text"
              value={checkResourceId}
              onChange={(e) => setCheckResourceId(e.target.value)}
              placeholder="UUID"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={checking || !checkResourceId.trim()}
            className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {checking ? 'Checking...' : 'Check'}
          </button>
        </form>

        {checkResult && (
          <div className={`mt-4 rounded-lg p-4 ${checkResult.all_passed ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <p className={`text-sm font-medium ${checkResult.all_passed ? 'text-green-800' : 'text-red-800'}`}>
              {checkResult.all_passed ? 'All gates passed' : `${checkResult.blocking_failures.length} gate(s) failed`}
            </p>
            {checkResult.blocking_failures.length > 0 && (
              <ul className="mt-2 space-y-1">
                {checkResult.blocking_failures.map((f, i) => (
                  <li key={i} className="text-sm text-red-700">
                    <span className="font-mono font-medium">{f.gate_code}</span> — {f.gate_name}: {f.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
