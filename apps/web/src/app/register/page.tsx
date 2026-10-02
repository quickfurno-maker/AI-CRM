'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

const inputClass =
  'h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-indigo-400/60 focus:bg-white/[0.06]';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: form.get('displayName'),
        email: form.get('email'),
        password: form.get('password'),
        organizationName: form.get('organizationName'),
        organizationSlug: form.get('organizationSlug'),
      }),
    });
    const payload = (await response.json()) as { message?: string | string[] };
    if (!response.ok) {
      const message = Array.isArray(payload.message) ? payload.message.join(' ') : payload.message;
      setError(message ?? 'Unable to create organization.');
      setLoading(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(99,102,241,0.17),transparent_34%),radial-gradient(circle_at_85%_85%,rgba(16,185,129,0.08),transparent_30%)]" />
      <section className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#0d1017]/90 p-7 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-9">
        <div className="mb-7">
          <div className="mb-5 inline-flex items-center rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1 text-xs font-medium text-indigo-200">
            Create your tenant
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Start your Business OS</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Creates an isolated organization, owner role, workspace and Starter entitlements.</p>
        </div>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2 text-sm text-zinc-300 sm:col-span-2"><span>Your name</span><input className={inputClass} name="displayName" required /></label>
          <label className="block space-y-2 text-sm text-zinc-300 sm:col-span-2"><span>Email</span><input className={inputClass} name="email" type="email" autoComplete="email" required /></label>
          <label className="block space-y-2 text-sm text-zinc-300 sm:col-span-2"><span>Password</span><input className={inputClass} name="password" type="password" minLength={10} autoComplete="new-password" required /></label>
          <label className="block space-y-2 text-sm text-zinc-300"><span>Organization</span><input className={inputClass} name="organizationName" placeholder="Acme Realty" required /></label>
          <label className="block space-y-2 text-sm text-zinc-300"><span>Slug</span><input className={inputClass} name="organizationSlug" placeholder="acme-realty" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" autoCapitalize="none" required /></label>
          {error ? <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200 sm:col-span-2">{error}</p> : null}
          <button disabled={loading} className="mt-2 h-12 rounded-xl bg-white font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2">
            {loading ? 'Creating workspace…' : 'Create workspace'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-zinc-500">Already have an organization?{' '}<Link href="/login" className="font-medium text-indigo-300 hover:text-indigo-200">Sign in</Link></p>
      </section>
    </main>
  );
}
