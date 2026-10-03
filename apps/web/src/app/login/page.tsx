'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, LoaderCircle } from '@/components/icons';
import { FormEvent, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
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
        const message = Array.isArray(payload.message)
          ? payload.message.join(' ')
          : payload.message;
        setError(message ?? 'Unable to sign in.');
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Unable to reach the secure workspace. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Secure workspace"
      title="Welcome back."
      description="Sign in with your organization identity to continue where your team left off."
      footer={
        <>
          New organization?{' '}
          <Link href="/register">Create a workspace</Link>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4" aria-busy={loading}>
        <label className="auth-field">
          <span>Email address</span>
          <input
            className="auth-input"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            placeholder="you@company.com"
            required
          />
        </label>

        <label className="auth-field">
          <span>Password</span>
          <input
            className="auth-input"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            required
          />
        </label>

        <label className="auth-field">
          <span>Organization slug</span>
          <input
            className="auth-input"
            name="organizationSlug"
            placeholder="acme-realty"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </label>

        <div aria-live="polite" aria-atomic="true">
          {error ? <div className="auth-error">{error}</div> : null}
        </div>

        <button disabled={loading} className="auth-primary" type="submit">
          {loading ? (
            <>
              <LoaderCircle size={16} className="animate-spin" />
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}