'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

const inputClass =
  'h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-indigo-400/60 focus:bg-white/[0.06]';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password'),
        organizationSlug: form.get('organizationSlug'),
      }),
    });
    const payload = (await response.json()) as { message?: string | string[] };
    if (!response.ok) {
      const message = Array.isArray(payload.message) ? payload.message.join(' ') : payload.message;
      setError(message ?? 'Unable to sign in.');
      setLoading(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(99,102,241,0.16),transparent_35%),radial-gradient(circle_at_80%_85%,rgba(14,165,233,0.10),transparent_32%)]" />
      <section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0d1017]/90 p-7 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-9">
        <div className="mb-8">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1 text-xs font-medium text-indigo-200">
            Business OS · Foundation
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Sign in to your organization workspace.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-2 text-sm text-zinc-300">
            <span>Email</span>
            <input className={inputClass} name="email" type="email" autoComplete="email" required />
          </label>
          <label className="block space-y-2 text-sm text-zinc-300">
            <span>Password</span>
            <input className={inputClass} name="password" type="password" autoComplete="current-password" required />
          </label>
          <label className="block space-y-2 text-sm text-zinc-300">
            <span>Organization slug</span>
            <input className={inputClass} name="organizationSlug" placeholder="acme-realty" autoCapitalize="none" required />
          </label>
          {error ? <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
          <button disabled={loading} className="mt-2 h-12 w-full rounded-xl bg-white font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-zinc-500">
          New organization?{' '}
          <Link href="/register" className="font-medium text-indigo-300 hover:text-indigo-200">Create workspace</Link>
        </p>
      </section>
    </main>
  );
}
