'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, LoaderCircle } from '@/components/icons';
import { Suspense, useEffect, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';

function Exchange() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get('code');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) return;

    fetch('/api/enterprise-sso/exchange', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
      cache: 'no-store',
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          returnTo?: string;
          message?: string | string[];
        };
        if (!response.ok) {
          throw new Error(
            Array.isArray(body.message)
              ? body.message.join(' ')
              : body.message ?? 'SSO session exchange failed.',
          );
        }
        router.replace(body.returnTo ?? '/dashboard');
        router.refresh();
      })
      .catch((reason: Error) => setError(reason.message));
  }, [code, router]);

  const displayError = code ? error : 'Missing secure SSO handoff code.';

  if (displayError) {
    return (
      <>
        <div className="auth-error flex items-start gap-2" role="alert">
          <AlertTriangle size={15} className="mt-0.5 flex-none" />
          <span>{displayError}</span>
        </div>
        <Link href="/login" className="auth-primary mt-4">
          Return to sign in
        </Link>
      </>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-center">
      <LoaderCircle size={24} className="mx-auto animate-spin text-violet-300" />
      <div className="mt-4 text-sm font-medium text-zinc-200">
        Establishing your secure session
      </div>
      <div className="mt-1 text-xs leading-5 text-zinc-600">
        Verifying the identity-provider handoff and tenant access…
      </div>
    </div>
  );
}

export default function SsoCallbackPage() {
  return (
    <AuthShell
      eyebrow="Enterprise identity"
      title="Completing sign-in."
      description="Business OS is validating the authorization handoff before opening your tenant workspace."
      footer={<span>Do not refresh while the secure exchange is in progress.</span>}
    >
      <Suspense
        fallback={
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-center text-xs text-zinc-500">
            Preparing secure exchange…
          </div>
        }
      >
        <Exchange />
      </Suspense>
    </AuthShell>
  );
}