'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, LoaderCircle } from '@/components/icons';
import { FormEvent, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
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
        const message = Array.isArray(payload.message)
          ? payload.message.join(' ')
          : payload.message;
        setError(message ?? 'Unable to create organization.');
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Unable to create the workspace right now. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="New organization"
      title="Build your operating workspace."
      description="Create an isolated tenant with owner access, a primary workspace and starter capabilities."
      footer={
        <>
          Already have a workspace?{' '}
          <Link href="/login">Sign in</Link>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4" aria-busy={loading}>
        <label className="auth-field">
          <span>Your name</span>
          <input
            className="auth-input"
            name="displayName"
            autoComplete="name"
            autoFocus
            placeholder="Your full name"
            required
          />
        </label>

        <label className="auth-field">
          <span>Work email</span>
          <input
            className="auth-input"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
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
            minLength={10}
            autoComplete="new-password"
            placeholder="At least 10 characters"
            required
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="auth-field">
            <span>Organization</span>
            <input
              className="auth-input"
              name="organizationName"
              placeholder="Acme Realty"
              required
            />
          </label>
          <label className="auth-field">
            <span>Workspace slug</span>
            <input
              className="auth-input"
              name="organizationSlug"
              placeholder="acme-realty"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </label>
        </div>

        <div aria-live="polite" aria-atomic="true">
          {error ? <div className="auth-error">{error}</div> : null}
        </div>

        <button disabled={loading} className="auth-primary" type="submit">
          {loading ? (
            <>
              <LoaderCircle size={16} className="animate-spin" />
              Creating workspace…
            </>
          ) : (
            <>
              Create workspace
              <ArrowRight size={15} />
            </>
          )}
        </button>

        <p className="m-0 text-[10px] leading-5 text-zinc-600">
          By creating a workspace, you establish a tenant-isolated organization.
          Product seats, WhatsApp, AI and paid add-ons can be configured after setup.
        </p>
      </form>
    </AuthShell>
  );
}