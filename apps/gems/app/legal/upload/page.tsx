'use client';

import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import Link from 'next/link';
import { uploadDocument, getApiErrorMessage } from '@/lib/legal-api';

export default function LegalUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState('CONTRACT');
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Select a file');
      const form = new FormData();
      form.append('file', file);
      form.append('title', title || file.name);
      form.append('document_type', documentType);
      return uploadDocument(form, setProgress);
    },
    onSuccess: () => {
      queryClient.invalidateQueries('legal-documents');
      setFile(null);
      setTitle('');
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  const result = uploadMutation.data;
  const isUploading = uploadMutation.isLoading;

  return (
    <div className="max-w-xl space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Upload document</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setFile(f ?? null);
                if (f && !title) setTitle(f.name);
              }}
              disabled={isUploading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              disabled={isUploading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Document type</label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              disabled={isUploading}
            >
              <option value="CONTRACT">Contract</option>
              <option value="JUDICIAL">Judicial</option>
              <option value="NOTARY">Notary</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          {isUploading && (
            <div>
              <div className="h-2 w-full rounded bg-gray-200">
                <div className="h-2 rounded bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1 text-sm text-gray-500">{progress}%</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => uploadMutation.mutate()}
            disabled={!file || isUploading}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isUploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
        {uploadMutation.isError && (
          <p className="mt-4 text-sm text-red-600">{getApiErrorMessage(uploadMutation.error)}</p>
        )}
      </div>

      {result && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-6">
          <h2 className="text-lg font-medium text-green-900 mb-2">Upload result (CPO)</h2>
          <dl className="grid grid-cols-1 gap-2 text-sm">
            <div><dt className="text-green-700">Document number</dt><dd className="font-medium">{result.document_number}</dd></div>
            <div><dt className="text-green-700">Title</dt><dd className="font-medium">{result.title}</dd></div>
            <div><dt className="text-green-700">Status (CPO)</dt><dd className="font-medium">{result.status_cpo ?? '—'}</dd></div>
            <div><dt className="text-green-700">Status</dt><dd className="font-medium">{result.status}</dd></div>
            <div><dt className="text-green-700">Processing</dt><dd className="font-medium">{result.processing}</dd></div>
          </dl>
          <Link href={`/legal/documents/${result.id}`} className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline">
            View document →
          </Link>
        </div>
      )}
    </div>
  );
}
