'use client';

import Link from 'next/link';
import { WorkspaceLoading } from '@/components/workspace-states';
import { useCallback, useEffect, useState } from 'react';

type Item = {
  kind: 'FIRST_PARTY' | 'MARKETPLACE';
  id?: string;
  key: string;
  name: string;
  version: string;
  publisher: string;
  description: string;
  category: string;
  requiredScopes: string[];
  eventSubscriptions: string[];
  installMode: 'PROVIDER_ENTITLEMENT' | 'TENANT_INSTALL';
  installed: boolean;
  installationId?: string;
  status: string;
};

type Session = {
  capabilities: {
    entitlements: Array<{ key: string; enabled: boolean }>;
  };
};

async function api<T>(path = '', init?: RequestInit): Promise<T> {
  const target = path ? '/api/marketplace/' + path : '/api/marketplace';
  const response = await fetch(target, {
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
    throw new Error(message ?? 'Marketplace request failed.');
  }
  return body;
}

export default function MarketplacePage() {
  const [enabled, setEnabled] = useState<boolean>();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const sessionResponse = await fetch('/api/session', { cache: 'no-store' });
      if (!sessionResponse.ok) throw new Error('Unable to load tenant session.');
      const session = (await sessionResponse.json()) as Session;
      setEnabled(
        session.capabilities.entitlements.some(
          (item) => item.key === 'marketplace.enabled' && item.enabled,
        ),
      );
      setItems(await api<Item[]>());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load Marketplace.');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function toggle(item: Item) {
    if (!item.id || item.installMode !== 'TENANT_INSTALL') return;
    setBusy(item.id);
    setError('');
    try {
      await api(item.id + '/' + (item.installed ? 'uninstall' : 'install'), {
        method: 'POST',
        ...(item.installed
          ? {}
          : {
              body: JSON.stringify({
                scopes: item.requiredScopes,
              }),
            }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Marketplace action failed.');
    } finally {
      setBusy(undefined);
    }
  }

  if (enabled === undefined) {
    return <WorkspaceLoading label="Marketplace" />;
  }

  return (
    <main className="min-h-screen bg-[#07090d] p-4 text-zinc-100 sm:p-7 lg:p-10">
      <div className="mx-auto max-w-[1400px]">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-300">Business OS · Extension Marketplace</div>
            <h1 className="mt-2 text-3xl font-semibold">Marketplace</h1>
            <p className="mt-2 text-sm text-zinc-500">
              First-party industry packs plus governed external integrations. Third-party code runs outside the CRM-AI runtime.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/developer" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300">Developer Console</Link>
            <Link href="/dashboard" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300">Command Center</Link>
          </div>
        </header>

        {error ? <div role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
        {enabled === false ? (
          <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200">
            Marketplace browsing is available, but tenant installation is disabled until your provider enables <code>marketplace.enabled</code>.
          </div>
        ) : null}

        <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article key={item.kind + ':' + item.key + ':' + item.version} className="rounded-2xl border border-white/10 bg-[#0d1017] p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-fuchsia-300">
                    {item.kind === 'FIRST_PARTY' ? 'First-party extension' : item.category}
                  </div>
                  <h2 className="mt-2 text-xl font-semibold">{item.name}</h2>
                  <div className="mt-1 text-xs text-zinc-600">{item.publisher} · v{item.version}</div>
                </div>
                <span className={item.installed ? 'rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-300' : 'rounded-full bg-white/[0.05] px-2.5 py-1 text-xs text-zinc-500'}>
                  {item.installed ? 'Installed' : 'Available'}
                </span>
              </div>

              <p className="mt-4 min-h-20 text-sm leading-6 text-zinc-500">{item.description}</p>

              <div className="mt-5 rounded-xl border border-white/[0.07] bg-black/20 p-3">
                <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-600">Required API scopes</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.requiredScopes.length ? item.requiredScopes.map((scope) => (
                    <span key={scope} className="rounded-md bg-white/[0.05] px-2 py-1 font-mono text-[10px] text-zinc-400">{scope}</span>
                  )) : <span className="text-xs text-zinc-600">No external API scopes</span>}
                </div>
              </div>

              {item.installMode === 'PROVIDER_ENTITLEMENT' ? (
                <div className="mt-5 text-xs leading-5 text-zinc-500">
                  Provider-managed add-on. Enable or disable it through your subscription/provider.
                </div>
              ) : (
                <button
                  disabled={busy === item.id || (!item.installed && !enabled)}
                  onClick={() => void toggle(item)}
                  className={
                    'mt-5 h-10 w-full rounded-xl text-sm font-semibold disabled:opacity-40 ' +
                    (item.installed
                      ? 'border border-red-400/20 text-red-300'
                      : 'bg-white text-zinc-950')
                  }
                >
                  {busy === item.id
                    ? 'Updating…'
                    : item.installed
                      ? 'Uninstall'
                      : 'Install extension'}
                </button>
              )}
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
