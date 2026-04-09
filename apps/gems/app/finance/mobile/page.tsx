'use client';

import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';

interface GpsCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export default function FinanceMobilePage() {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // GPS
  const [gpsCoords, setGpsCoords] = useState<GpsCoords | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'ok' | 'denied' | 'unavailable'>('idle');

  // Camera
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    acquireGps();
    return () => { stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function acquireGps() {
    if (!navigator.geolocation) { setGpsStatus('unavailable'); return; }
    setGpsStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) });
        setGpsStatus('ok');
      },
      (err) => setGpsStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      setCameraActive(true);
    } catch {
      setError('Permissão de câmera negada ou não disponível.');
    }
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current; const c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    setPhotoBase64(c.toDataURL('image/jpeg', 0.7));
    stopCamera();
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }

  async function handleCapture() {
    setLoading(true); setError(''); setSuccess('');
    try {
      const amountCents = Math.round(parseFloat(amount || '0') * 100);
      if (amountCents <= 0) throw new Error('Informe um valor válido.');

      const notes = [
        'Captura mobile — Zero Footprint',
        gpsCoords ? `GPS: ${gpsCoords.latitude.toFixed(6)}, ${gpsCoords.longitude.toFixed(6)} (±${gpsCoords.accuracy}m)` : null,
        photoBase64 ? 'Comprovante fotográfico anexado.' : null,
      ].filter(Boolean).join(' | ');

      await api.post('/finance/transactions', {
        transaction_type: 'EXPENSE',
        amount_cents: amountCents,
        currency: 'BRL',
        transaction_date: new Date().toISOString().split('T')[0],
        description: description.trim() || 'Despesa capturada via mobile',
        notes,
        receipt_reference: photoBase64 ?? undefined,
        // Required by orphanhood rule — mobile expense links to generic operational project
        process_id: undefined,
      });

      setSuccess('Despesa registrada com sucesso. Dados não permanecem no dispositivo.');
      setDescription(''); setAmount(''); setPhotoBase64(null);
      acquireGps();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Falha ao registrar despesa.');
    } finally {
      setLoading(false);
    }
  }

  const gpsLabel = {
    idle: 'GPS aguardando...',
    loading: 'Obtendo GPS...',
    ok: gpsCoords ? `GPS: ${gpsCoords.latitude.toFixed(4)}, ${gpsCoords.longitude.toFixed(4)} (±${gpsCoords.accuracy}m)` : 'GPS ativo',
    denied: 'GPS: permissão negada',
    unavailable: 'GPS não disponível',
  }[gpsStatus];

  const gpsColor = { idle: 'bg-gray-400', loading: 'bg-yellow-400 animate-pulse', ok: 'bg-green-500', denied: 'bg-red-500', unavailable: 'bg-gray-400' }[gpsStatus];

  return (
    <div className="max-w-md mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Lançador Mobile</h1>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 flex items-center gap-2">
        <span>🛡️</span>
        <span>Zero Footprint — nenhum dado permanece no dispositivo após o envio.</span>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Ex: Almoço com cliente" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
          <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0,00" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>

        {/* Camera */}
        <div className="space-y-2">
          {cameraActive ? (
            <div className="space-y-2">
              <video ref={videoRef} className="w-full rounded border border-gray-300 bg-black" style={{ maxHeight: 220 }} playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex gap-2">
                <button onClick={capturePhoto} className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">📸 Capturar</button>
                <button onClick={stopCamera} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
              </div>
            </div>
          ) : photoBase64 ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoBase64} alt="Comprovante" className="w-full rounded border border-gray-200 object-cover" style={{ maxHeight: 160 }} />
              <div className="flex gap-2">
                <button onClick={() => setPhotoBase64(null)} className="flex-1 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">🗑️ Remover</button>
                <button onClick={startCamera} className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm text-gray-700">📷 Nova foto</button>
              </div>
            </div>
          ) : (
            <button onClick={startCamera} className="flex items-center gap-2 rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              📷 Fotografar Comprovante
            </button>
          )}
        </div>

        {/* GPS */}
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${gpsColor}`} />
          <span className="text-xs text-gray-600">{gpsLabel}</span>
          {gpsStatus !== 'loading' && gpsStatus !== 'ok' && (
            <button onClick={acquireGps} className="ml-auto text-xs text-blue-600 hover:underline">Tentar novamente</button>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}

        <button onClick={handleCapture} disabled={loading}
          className="w-full rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Enviando...' : 'Registrar Despesa'}
        </button>
      </div>
    </div>
  );
}
