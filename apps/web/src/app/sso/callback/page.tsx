'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

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

  const displayError = code ? error : 'Missing SSO handoff code.';

  if (displayError) {
    return (
      <div className="w-full max-w-lg rounded-3xl border border-red-400/20 bg-[#0d1017] p-8">
        <h1 className="text-2xl font-semibold text-white">SSO sign-in failed</h1>
        <p className="mt-3 text-sm leading-6 text-red-200">{displayError}</p>
      </div>
    );
  }

  return (
    <div className="text-sm text-zinc-500">
      Establishing secure enterprise session…
    </div>
  );
}

export default function SsoCallbackPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#07090d] p-5 text-zinc-100">
      <Suspense fallback={<div className="text-sm text-zinc-500">Completing SSO…</div>}>
        <Exchange />
      </Suspense>
    </main>
  );
}
