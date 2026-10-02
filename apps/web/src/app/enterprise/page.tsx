'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type Policy = {
  enforceIpAllowlist: boolean;
  ipAllowlist: string[];
  allowedEmailDomains: string[];
  sessionMaxMinutes: number;
  auditRetentionDays: number;
};
type Connection = {
  id: string;
  providerType: string;
  name: string;
  issuerUrl: string;
  clientId: string;
  domains: string[];
  status: string;
  lastVerifiedAt?: string | null;
};
type ScimToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
};
type Session = {
  capabilities: {
    entitlements: Array<{ key: string; enabled: boolean }>;
  };
};

const field =
  'h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-cyan-400/50';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/enterprise/' + path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  const body = (await response.json()) as T & { message?: string | string[] };
  if (!response.ok) {
    const message = Array.isArray(body.message)
      ? body.message.join(' ')
      : body.message;
    throw new Error(message ?? 'Enterprise request failed.');
  }
  return body;
}

export default function EnterprisePage() {
  const [enabled, setEnabled] = useState<boolean>();
  const [policy, setPolicy] = useState<Policy>();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [scimTokens, setScimTokens] = useState<ScimToken[]>([]);
  const [revealed, setRevealed] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const sessionResponse = await fetch('/api/session', { cache: 'no-store' });
      if (!sessionResponse.ok) throw new Error('Unable to load tenant session.');
      const session = (await sessionResponse.json()) as Session;
      const enterprise =
        session.capabilities.entitlements.find(
          (item) => item.key === 'enterprise.controls',
        )?.enabled ?? false;
      setEnabled(enterprise);
      if (!enterprise) return;
      const [policyRow, connectionRows, tokens] = await Promise.all([
        api<Policy>('security-policy'),
        api<Connection[]>('identity-connections'),
        api<ScimToken[]>('scim-tokens'),
      ]);
      setPolicy(policyRow);
      setConnections(connectionRows);
      setScimTokens(tokens);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load enterprise controls.');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function updatePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      await api('security-policy', {
        method: 'PATCH',
        body: JSON.stringify({
          enforceIpAllowlist: form.get('enforceIp') === 'on',
          ipAllowlist: split(form.get('ipAllowlist')),
          allowedEmailDomains: split(form.get('domains')),
          sessionMaxMinutes: Number(form.get('sessionMaxMinutes')),
          auditRetentionDays: Number(form.get('auditRetentionDays')),
        }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update policy.');
    } finally {
      setBusy(false);
    }
  }

  async function createConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError('');
    try {
      const form = new FormData(formElement);
      await api('identity-connections', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          providerType: 'OIDC',
          issuerUrl: form.get('issuerUrl'),
          clientId: form.get('clientId'),
          clientSecret: form.get('clientSecret'),
          domains: split(form.get('domains')),
        }),
      });
      formElement.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create identity connection.');
    } finally {
      setBusy(false);
    }
  }

  async function createScimToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError('');
    try {
      const form = new FormData(formElement);
      const result = await api<{ token: string }>('scim-tokens', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          expiresAt: form.get('expiresAt') || undefined,
        }),
      });
      setRevealed(result.token);
      formElement.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create SCIM token.');
    } finally {
      setBusy(false);
    }
  }

  async function action(path: string) {
    setBusy(true);
    setError('');
    try {
      await api(path, { method: 'POST' });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enterprise action failed.');
    } finally {
      setBusy(false);
    }
  }

  if (enabled === undefined) {
    return <main className="grid min-h-screen place-items-center bg-[#07090d] text-sm text-zinc-500">Loading Enterprise controls…</main>;
  }

  if (!enabled) {
    return (
      <main className="min-h-screen bg-[#07090d] p-6 text-zinc-100">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-[#0d1017] p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Business OS · Enterprise</div>
          <h1 className="mt-3 text-3xl font-semibold">Enterprise controls are not enabled</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-500">Your provider must enable the <code className="text-zinc-300">enterprise.controls</code> add-on for SSO, SCIM and advanced security policy controls.</p>
          <Link href="/dashboard" className="mt-6 inline-flex rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300">Back to Command Center</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07090d] p-4 text-zinc-100 sm:p-7 lg:p-10">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Business OS · Enterprise</div>
            <h1 className="mt-2 text-3xl font-semibold">Enterprise Security</h1>
            <p className="mt-2 text-sm text-zinc-500">OIDC SSO, SCIM provisioning, IP/domain policy, session limits and audit retention.</p>
          </div>
          <Link href="/dashboard" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300">Command Center</Link>
        </header>

        {error ? <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
        {revealed ? (
          <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] p-4">
            <div className="text-sm font-medium text-amber-200">SCIM bearer token</div>
            <div className="mt-2 break-all rounded-lg bg-black/30 p-3 font-mono text-xs">{revealed}</div>
            <div className="mt-2 text-xs text-amber-200/70">Copy it now. Only its hash is stored.</div>
          </div>
        ) : null}

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          {policy ? (
            <form onSubmit={updatePolicy} className="rounded-2xl border border-white/10 bg-[#0d1017] p-6">
              <h2 className="font-semibold">Security policy</h2>
              <div className="mt-4 grid gap-3">
                <label className="flex items-center gap-3 rounded-xl border border-white/[0.07] p-3 text-sm text-zinc-400">
                  <input name="enforceIp" type="checkbox" defaultChecked={policy.enforceIpAllowlist} />
                  Enforce IP allowlist
                </label>
                <input className={field} name="ipAllowlist" defaultValue={policy.ipAllowlist.join(', ')} placeholder="203.0.113.10, 198.51.100.0/24" />
                <input className={field} name="domains" defaultValue={policy.allowedEmailDomains.join(', ')} placeholder="company.com, subsidiary.com" />
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-xs text-zinc-500">Session max minutes<input className={field} name="sessionMaxMinutes" type="number" min={15} max={525600} defaultValue={policy.sessionMaxMinutes} /></label>
                  <label className="grid gap-1 text-xs text-zinc-500">Audit retention days<input className={field} name="auditRetentionDays" type="number" min={30} max={3650} defaultValue={policy.auditRetentionDays} /></label>
                </div>
                <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-50">Save security policy</button>
              </div>
            </form>
          ) : null}

          <form onSubmit={createConnection} className="rounded-2xl border border-white/10 bg-[#0d1017] p-6">
            <h2 className="font-semibold">Add OIDC identity provider</h2>
            <div className="mt-4 grid gap-3">
              <input className={field} name="name" placeholder="Microsoft Entra ID" required />
              <input className={field} name="issuerUrl" type="url" placeholder="https://login.example.com/tenant/v2.0" required />
              <input className={field} name="clientId" placeholder="OIDC client ID" required />
              <input className={field} name="clientSecret" type="password" placeholder="OIDC client secret" required />
              <input className={field} name="domains" placeholder="company.com" />
              <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-50">Add connection</button>
            </div>
          </form>

          <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-6">
            <h2 className="font-semibold">Identity connections</h2>
            <div className="mt-4 space-y-2">
              {connections.map((connection) => (
                <div key={connection.id} className="rounded-xl border border-white/[0.07] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{connection.name}</div>
                      <div className="mt-1 max-w-xl truncate text-xs text-zinc-600">{connection.issuerUrl}</div>
                      <div className="mt-1 text-xs text-zinc-500">{connection.domains.join(', ') || 'All policy-allowed domains'}</div>
                    </div>
                    <span className={connection.status === 'ACTIVE' ? 'text-xs text-emerald-300' : 'text-xs text-zinc-500'}>{connection.status}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {connection.status !== 'ACTIVE' ? (
                      <button disabled={busy} onClick={() => void action('identity-connections/' + connection.id + '/verify')} className="rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-zinc-950">Verify discovery</button>
                    ) : (
                      <Link href={'/sso/' + connection.id} className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-zinc-950">Test SSO</Link>
                    )}
                    {connection.status !== 'DISABLED' ? (
                      <button disabled={busy} onClick={() => void action('identity-connections/' + connection.id + '/disable')} className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs text-red-300">Disable</button>
                    ) : null}
                  </div>
                </div>
              ))}
              {!connections.length ? <div className="py-6 text-center text-sm text-zinc-600">No identity providers configured.</div> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-6">
            <h2 className="font-semibold">SCIM provisioning</h2>
            <form onSubmit={createScimToken} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <input className={field} name="name" placeholder="Entra SCIM" required />
              <input className={field} name="expiresAt" type="datetime-local" />
              <button disabled={busy} className="h-10 rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950">Create token</button>
            </form>
            <div className="mt-4 text-xs leading-5 text-zinc-500">
              SCIM base path: <code className="text-zinc-300">/v1/scim/v2</code>. Users are provisioned without roles by default; role assignment remains explicit.
            </div>
            <div className="mt-4 space-y-2">
              {scimTokens.map((token) => (
                <div key={token.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] p-3">
                  <div>
                    <div className="text-sm font-medium">{token.name}</div>
                    <div className="mt-1 font-mono text-[10px] text-zinc-600">{token.tokenPrefix}…</div>
                  </div>
                  <button disabled={busy || Boolean(token.revokedAt)} onClick={() => void action('scim-tokens/' + token.id + '/revoke')} className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs text-red-300 disabled:opacity-30">
                    {token.revokedAt ? 'Revoked' : 'Revoke'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function split(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
