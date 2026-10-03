'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, LoaderCircle, ShieldCheck } from '@/components/icons';
import { useState } from 'react';
import { AuthShell } from '@/components/auth-shell';

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
    <AuthShell
      eyebrow="Enterprise identity"
      title="Continue with SSO."
      description="Use your organization identity provider. The authorization-code flow uses PKCE and your provider password is never sent to Business OS."
      footer={
        <>
          Prefer password sign-in? <Link href="/login">Use email and password</Link>
        </>
      }
    >
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300">
            <ShieldCheck size={17} />
          </span>
          <div>
            <div className="text-xs font-semibold text-zinc-200">
              Secure redirect
            </div>
            <p className="mt-1 text-[11px] leading-5 text-zinc-600">
              You will leave Business OS briefly to authenticate with your approved
              identity provider, then return to your tenant workspace.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4" aria-live="polite">
        {error ? <div className="auth-error">{error}</div> : null}
      </div>

      <button
        disabled={busy}
        onClick={() => void begin()}
        className="auth-primary mt-4"
        type="button"
      >
        {busy ? (
          <>
            <LoaderCircle size={16} className="animate-spin" />
            Redirecting securely…
          </>
        ) : (
          <>
            Continue with identity provider
            <ArrowRight size={15} />
          </>
        )}
      </button>
    </AuthShell>
  );
}