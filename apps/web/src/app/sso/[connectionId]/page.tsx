'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

export default function SsoStartPage() {
  const params = useParams<{ connectionId: string }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function begin() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        '/api/enterprise-sso/' +
          encodeURIComponent(params.connectionId) +
          '/start?returnTo=%2Fdashboard',
        { cache: 'no-store' },
      );
      const body = (await response.json()) as {
        authorizationUrl?: string;
        message?: string | string[];
      };
      if (!response.ok || !body.authorizationUrl) {
        throw new Error(
          Array.isArray(body.message)
            ? body.message.join(' ')
            : body.message ?? 'Unable to start SSO.',
        );
      }
      window.location.assign(body.authorizationUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to start SSO.');
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#07090d] p-5 text-zinc-100">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0d1017] p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
          Business OS · Enterprise SSO
        </div>
        <h1 className="mt-3 text-3xl font-semibold">Continue with your identity provider</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-500">
          CRM-AI will use an authorization-code flow with PKCE. Your provider password is never sent to CRM-AI.
        </p>
        {error ? <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</div> : null}
        <button
          disabled={busy}
          onClick={() => void begin()}
          className="mt-6 h-11 w-full rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-50"
        >
          {busy ? 'Redirecting…' : 'Continue with SSO'}
        </button>
        <Link href="/login" className="mt-4 block text-center text-xs text-zinc-500">
          Use password sign-in instead
        </Link>
      </div>
    </main>
  );
}
