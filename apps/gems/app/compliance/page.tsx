'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'react-query';
import { api } from '@/lib/api';

interface AuditStatus {
  tenant_id: string;
  status: string;
  total_entries: number;
  latest_hash_valid: boolean;
  checked_at: string;
}

interface VerificationIssue {
  entry_id: string;
  entry_timestamp: string;
  previous_hash: string;
  calculated_hash: string;
  stored_hash: string;
  is_valid: boolean;
  error?: string;
}

interface VerificationResult {
  tenant_id: string;
  verified_at: string;
  total_entries: number;
  valid_entries: number;
  invalid_entries: number;
  chain_integrity: 'valid' | 'invalid' | 'partial';
  issues: VerificationIssue[];
  genesis_hash: string;
  latest_hash: string;
}

function integrityBadge(status: string) {
  switch (status) {
    case 'valid':
      return <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">Valid</span>;
    case 'invalid':
      return <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">Invalid</span>;
    case 'partial':
      return <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">Partial</span>;
    case 'no_entries':
      return <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">No entries</span>;
    default:
      return <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">{status}</span>;
  }
}

export default function CompliancePage() {
  const [verification, setVerification] = useState<VerificationResult | null>(null);

  const { data: statusData, isLoading: statusLoading, error: statusError } = useQuery(
    'audit-status',
    async () => {
      const res = await api.get('/audit-integrity/status');
      return res.data.data as AuditStatus;
    },
    { staleTime: 30 * 1000 }
  );

  const verifyMutation = useMutation(
    async () => {
      const res = await api.get('/audit-integrity/verify-chain');
      return res.data.data as VerificationResult;
    },
    {
      onSuccess: (data) => setVerification(data),
    }
  );

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Audit Chain Status</h2>
        {statusLoading ? <p className="text-sm text-gray-500">Loading status...</p> : null}
        {statusError ? (
          <p className="text-sm text-red-600">Failed to load audit status. You may not have the required permissions.</p>
        ) : null}
        {statusData ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <dt className="text-gray-600">Status</dt>
            <dd>{integrityBadge(statusData.status)}</dd>
            <dt className="text-gray-600">Total entries</dt>
            <dd className="font-medium">{statusData.total_entries ?? 0}</dd>
            <dt className="text-gray-600">Latest hash valid</dt>
            <dd className="font-medium">{statusData.latest_hash_valid ? 'Yes' : 'No'}</dd>
            <dt className="text-gray-600">Last checked</dt>
            <dd className="font-medium">{statusData.checked_at ? new Date(statusData.checked_at).toLocaleString() : '--'}</dd>
          </dl>
        ) : null}
      </div>

      {/* Verify Button */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Full Chain Verification</h2>
        <p className="text-sm text-gray-600 mb-4">
          Run a full hash chain verification on all audit log entries. This checks every entry in order and validates that no records have been tampered with.
        </p>
        <button
          onClick={() => verifyMutation.mutate()}
          disabled={verifyMutation.isLoading}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {verifyMutation.isLoading ? 'Verifying...' : 'Verify Chain'}
        </button>
        {verifyMutation.isError && (
          <p className="mt-3 text-sm text-red-600">Verification request failed. You may not have the required permissions.</p>
        )}
      </div>

      {/* Verification Results */}
      {verification ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Verification Results</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-4">
            <dt className="text-gray-600">Chain integrity</dt>
            <dd>{integrityBadge(verification.chain_integrity)}</dd>
            <dt className="text-gray-600">Total entries</dt>
            <dd className="font-medium">{verification.total_entries}</dd>
            <dt className="text-gray-600">Valid entries</dt>
            <dd className="font-medium text-green-700">{verification.valid_entries}</dd>
            <dt className="text-gray-600">Invalid entries</dt>
            <dd className="font-medium text-red-700">{verification.invalid_entries}</dd>
            <dt className="text-gray-600">Verified at</dt>
            <dd className="font-medium">{new Date(verification.verified_at).toLocaleString()}</dd>
          </dl>

          {verification.issues.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Broken links ({verification.issues.length})</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 pr-4 font-medium text-gray-600">Entry ID</th>
                      <th className="text-left py-2 pr-4 font-medium text-gray-600">Timestamp</th>
                      <th className="text-left py-2 pr-4 font-medium text-gray-600">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verification.issues.map((issue) => (
                      <tr key={issue.entry_id} className="border-b border-gray-100">
                        <td className="py-2 pr-4 font-mono">{issue.entry_id.slice(0, 8)}...</td>
                        <td className="py-2 pr-4">{new Date(issue.entry_timestamp).toLocaleString()}</td>
                        <td className="py-2 pr-4 text-red-600">{issue.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {verification.issues.length === 0 && verification.chain_integrity === 'valid' && (
            <p className="text-sm text-green-700">All audit log entries have valid hash chains. No tampering detected.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
