'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type SessionData = {
  organization: {
    isPlatformAdmin?: boolean;
    organization: { id: string; name: string; slug: string };
  };
};

type Organization = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
};

type Addon = {
  key: string;
  enabled: boolean;
  source?: string | null;
};

type Extension = {
  key: string;
  name: string;
  version: string;
  entitlement: string;
  description: string;
  objects: string[];
  permissions: string[];
  events: string[];
  aiTools: string[];
  navigation: { label: string; href: string };
  enabled: boolean;
  source?: string | null;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/platform-admin/' + path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  if (response.status === 401) throw new Error('AUTH');
  const body = (await response.json()) as T & { message?: string | string[] };
  if (!response.ok) {
    const message = Array.isArray(body.message)
      ? body.message.join(' ')
      : body.message;
    throw new Error(message ?? 'Request failed.');
  }
  return body;
}

export default function ProviderPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean>();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [busyKey, setBusyKey] = useState<string>();
  const [error, setError] = useState('');

  const selected = useMemo(
    () => organizations.find((item) => item.id === selectedId),
    [organizations, selectedId],
  );

  const loadControls = useCallback(async (organizationId: string) => {
    const [extensionRows, addonRows] = await Promise.all([
      api<Extension[]>('organizations/' + organizationId + '/extensions'),
      api<Addon[]>('organizations/' + organizationId + '/addons'),
    ]);
    setExtensions(extensionRows);
    setAddons(addonRows);
  }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      const sessionResponse = await fetch('/api/session', { cache: 'no-store' });
      if (sessionResponse.status === 401) {
        router.replace('/login');
        return;
      }
      if (!sessionResponse.ok) {
        throw new Error('Unable to load provider session.');
      }
      const session = (await sessionResponse.json()) as SessionData;
      const isAdmin = session.organization.isPlatformAdmin === true;
      setAuthorized(isAdmin);
      if (!isAdmin) return;

      const rows = await api<Organization[]>('organizations');
      setOrganizations(rows);
      const nextId = rows[0]?.id;
      setSelectedId(nextId);
      if (nextId) await loadControls(nextId);
    } catch (reason) {
      if (reason instanceof Error && reason.message === 'AUTH') {
        router.replace('/login');
        return;
      }
      setError(
        reason instanceof Error ? reason.message : 'Unable to load provider console.',
      );
    }
  }, [loadControls, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function chooseOrganization(id: string) {
    setSelectedId(id);
    setError('');
    try {
      await loadControls(id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load extensions.');
    }
  }

  async function toggleAddon(addon: Addon) {
    if (!selectedId) return;
    setBusyKey(addon.key);
    setError('');
    try {
      await api(
        'organizations/' + selectedId + '/addons/' + addon.key,
        {
          method: 'PUT',
          body: JSON.stringify({ enabled: !addon.enabled }),
        },
      );
      await loadControls(selectedId);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to update add-on.',
      );
    } finally {
      setBusyKey(undefined);
    }
  }

  async function toggleExtension(extension: Extension) {
    if (!selectedId) return;
    setBusyKey(extension.key);
    setError('');
    try {
      await api(
        'organizations/' + selectedId + '/extensions/' + extension.key,
        {
          method: 'PUT',
          body: JSON.stringify({ enabled: !extension.enabled }),
        },
      );
      await loadControls(selectedId);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to update extension.',
      );
    } finally {
      setBusyKey(undefined);
    }
  }

  if (authorized === undefined) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#07090d] text-sm text-zinc-500">
        Loading provider console…
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen bg-[#07090d] p-6 text-zinc-100">
        <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-[#0d1017] p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Business OS · Provider
          </div>
          <h1 className="mt-3 text-3xl font-semibold">Provider access required</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-500">
            Extension controls are visible only to platform administrators.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300"
          >
            Back to Command Center
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto grid min-h-screen max-w-[1800px] lg:grid-cols-[320px_1fr]">
        <aside className="border-r border-white/10 bg-[#0b0e14] p-5">
          <div className="px-2">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
              Business OS Provider
            </div>
            <h1 className="mt-2 text-xl font-semibold">Client Organizations</h1>
            <p className="mt-1 text-xs text-zinc-600">
              Manage paid industry extensions.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="mt-6 block rounded-xl border border-white/10 px-3 py-2.5 text-sm text-zinc-400 hover:bg-white/5"
          >
            ← Command Center
          </Link>
          <Link
            href="/provider/marketplace"
            className="mt-2 block rounded-xl border border-white/10 px-3 py-2.5 text-sm text-zinc-400 hover:bg-white/5"
          >
            Marketplace publishing
          </Link>
          <Link
            href="/provider/commercial"
            className="mt-2 block rounded-xl border border-white/10 px-3 py-2.5 text-sm text-zinc-400 hover:bg-white/5"
          >
            Commercial operations
          </Link>

          <div className="mt-4 max-h-[calc(100vh-180px)] space-y-2 overflow-y-auto">
            {organizations.map((organization) => (
              <button
                key={organization.id}
                onClick={() => void chooseOrganization(organization.id)}
                className={
                  'w-full rounded-xl border px-3 py-3 text-left transition ' +
                  (selectedId === organization.id
                    ? 'border-violet-400/25 bg-violet-400/10'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]')
                }
              >
                <div className="truncate text-sm font-medium">{organization.name}</div>
                <div className="mt-1 truncate font-mono text-[10px] text-zinc-600">
                  {organization.slug}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 p-5 sm:p-8 lg:p-10">
          <header className="border-b border-white/10 pb-7">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
              Provider Extensions
            </div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              {selected?.name ?? 'Select an organization'}
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              Provider-controlled add-ons are enforced by the entitlement engine
              in the API, AI tools, and tenant UI.
            </p>
          </header>

          {error ? (
            <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <section className="mt-7">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              Platform add-ons
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {addons.map((addon) => (
                <article
                  key={addon.key}
                  className="rounded-2xl border border-white/10 bg-[#0d1017] p-5"
                >
                  <div className="font-mono text-xs text-violet-300">
                    {addon.key}
                  </div>
                  <div className="mt-2 text-sm text-zinc-500">
                    {addon.key === 'core.api'
                      ? 'API keys, OAuth clients and signed outbound webhooks.'
                      : addon.key === 'marketplace.enabled'
                        ? 'Tenant installation of governed marketplace integrations.'
                        : 'Enterprise SSO, SCIM and advanced security policies.'}
                  </div>
                  <button
                    disabled={busyKey === addon.key}
                    onClick={() => void toggleAddon(addon)}
                    className={
                      'mt-4 h-9 w-full rounded-xl text-xs font-semibold disabled:opacity-50 ' +
                      (addon.enabled
                        ? 'border border-red-400/20 text-red-300'
                        : 'bg-white text-zinc-950')
                    }
                  >
                    {addon.enabled ? 'Disable add-on' : 'Enable add-on'}
                  </button>
                </article>
              ))}
            </div>
          </section>

          <div className="mt-7 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Industry extensions
          </div>
          <div className="mt-3 grid gap-5 xl:grid-cols-2">
            {extensions.map((extension) => (
              <article
                key={extension.key}
                className="rounded-2xl border border-white/10 bg-[#0d1017] p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.15em] text-violet-300">
                      {extension.key} · v{extension.version}
                    </div>
                    <h3 className="mt-2 text-xl font-semibold">{extension.name}</h3>
                  </div>
                  <span
                    className={
                      'rounded-full px-2.5 py-1 text-xs font-medium ' +
                      (extension.enabled
                        ? 'bg-emerald-400/10 text-emerald-300'
                        : 'bg-white/[0.05] text-zinc-500')
                    }
                  >
                    {extension.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                <p className="mt-4 text-sm leading-6 text-zinc-500">
                  {extension.description}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <Metric label="Objects" value={extension.objects.length} />
                  <Metric label="Permissions" value={extension.permissions.length} />
                  <Metric label="AI tools" value={extension.aiTools.length} />
                </div>

                <div className="mt-5 rounded-xl border border-white/[0.07] bg-black/20 p-3">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-600">
                    Entitlement
                  </div>
                  <div className="mt-1 font-mono text-xs text-zinc-400">
                    {extension.entitlement}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-600">
                    Source: {extension.source ?? 'Not provisioned'}
                  </div>
                </div>

                <button
                  disabled={busyKey === extension.key}
                  onClick={() => void toggleExtension(extension)}
                  className={
                    'mt-5 h-10 w-full rounded-xl text-sm font-semibold disabled:opacity-50 ' +
                    (extension.enabled
                      ? 'border border-red-400/20 text-red-300 hover:bg-red-400/5'
                      : 'bg-white text-zinc-950')
                  }
                >
                  {busyKey === extension.key
                    ? 'Updating…'
                    : extension.enabled
                      ? 'Disable extension'
                      : 'Enable extension'}
                </button>
              </article>
            ))}

            {!extensions.length && selectedId ? (
              <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-8 text-sm text-zinc-600">
                No registered extensions.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
