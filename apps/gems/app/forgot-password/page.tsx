'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSuccess(true);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gray-100">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">GEMS — Recuperar Senha</h1>
        {success ? (
          <Card>
            <CardContent>
              <div className="text-center space-y-4">
                <p className="text-sm text-gray-700">
                  Se existir uma conta com esse e-mail, as instruções de recuperação foram enviadas.
                </p>
                <p className="text-sm text-gray-500">
                  Verifique sua caixa de entrada e siga as instruções do e-mail.
                </p>
                <Link href="/login" className="inline-block text-sm font-medium text-blue-600 hover:underline">
                  Voltar ao login
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Informe o e-mail associado à sua conta e enviaremos as instruções para redefinir sua senha.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="E-mail"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                {error && (
                  <p className="text-sm text-red-600" role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Enviando...' : 'Enviar link de recuperação'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
        <p className="mt-4 text-center text-sm text-gray-600">
          Lembrou a senha?{' '}
          <Link href="/login" className="font-medium text-blue-600 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
