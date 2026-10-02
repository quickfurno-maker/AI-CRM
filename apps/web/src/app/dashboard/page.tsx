'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Entitlement = {
  key: string;
  enabled: boolean;
  limitValue: number | null;
  source: string;
};

type SessionData = {
  organization: {
    isPlatformAdmin?: boolean;
    organization: {
      id: string;
      name: string;
      slug: string;
      status: string;
    };
    workspaces: Array<{ id: string; name: string; slug: string }>;
    branches: Array<{ id: string; name: string }>;
    teams: Array<{ id: string; name: string }>;
  };
  capabilities: {
    entitlements: Entitlement[];
  };
};

const nav = [
  { label: 'Command Center', href: '/dashboard', active: true },
  { label: 'CRM', href: '/crm', active: false },
  { label: 'Real Estate', href: '/real-estate', active: false, entitlement: 'extension.realestate' },
  { label: 'WhatsApp', href: '/whatsapp', active: false },
  { label: 'AI Agents', href: '/ai-agents', active: false },
  { label: 'Automations', href: '/automations', active: false },
  { label: 'Provider', href: '/provider', active: false, adminOnly: true },
  { label: 'Attendance', href: '/attendance', active: false, entitlement: 'extension.attendance' },
  { label: 'Billing' },
  { label: 'Analytics' },
];

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData>();
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/session', { cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace('/login');
          return undefined;
        }
        if (!response.ok) throw new Error('Unable to load workspace.');
        return (await response.json()) as SessionData;
      })
      .then((data) => data && setSession(data))
      .catch((reason: Error) => setError(reason.message));
  }, [router]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  if (error) {
    return <main className="grid min-h-screen place-items-center text-red-200">{error}</main>;
  }
  if (!session) {
    return <main className="grid min-h-screen place-items-center text-sm text-zinc-500">Loading secure workspace…</main>;
  }

  const org = session.organization.organization;
  const enabled = session.capabilities.entitlements.filter((item) => item.enabled);
  const visibleNav = nav.filter((item) => {
    if ('adminOnly' in item && item.adminOnly) {
      return session.organization.isPlatformAdmin === true;
    }
    return (
      !('entitlement' in item) ||
      enabled.some((entitlement) => entitlement.key === item.entitlement)
    );
  });
  const userLimit = session.capabilities.entitlements.find((item) => item.key === 'users.max')?.limitValue;

  return (
    <main className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto grid min-h-screen max-w-[1600px] lg:grid-cols-[250px_1fr]">
        <aside className="hidden border-r border-white/10 bg-[#0b0e14] p-5 lg:block">
          <div className="mb-8 px-2">
            <div className="text-xs font-medium uppercase tracking-[0.24em] text-indigo-300">Business OS</div>
            <div className="mt-2 truncate text-lg font-semibold">{org.name}</div>
            <div className="mt-1 text-xs text-zinc-500">{org.slug}</div>
          </div>
          <nav className="space-y-1">
            {visibleNav.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className={
                    'block rounded-xl px-3 py-2.5 text-sm ' +
                    (item.active
                      ? 'bg-white/10 text-white'
                      : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300')
                  }
                >
                  {item.label}
                </Link>
              ) : (
                <div
                  key={item.label}
                  className="rounded-xl px-3 py-2.5 text-sm text-zinc-600"
                >
                  {item.label}
                </div>
              ),
            )}
          </nav>
        </aside>

        <section className="p-5 sm:p-8 lg:p-10">
          <header className="flex items-start justify-between gap-4 border-b border-white/10 pb-7">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">Business OS · Core Platform</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Command Center</h1>
              <p className="mt-2 text-sm text-zinc-500">Tenant foundation is active and the Core CRM workspace is available.</p>
            </div>
            <button onClick={logout} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5">Sign out</button>
          </header>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Tenant isolation', 'Active', 'Organization context is session-bound'],
              ['Workspace', session.organization.workspaces[0]?.name ?? 'Main', `${session.organization.workspaces.length} workspace`],
              ['Starter users', String(userLimit ?? '—'), 'Controlled by entitlement'],
              ['Enabled capabilities', String(enabled.length), 'Plan-derived at signup'],
            ].map(([label, value, detail]) => (
              <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">{label}</div>
                <div className="mt-4 text-2xl font-semibold">{value}</div>
                <div className="mt-1 text-xs text-zinc-500">{detail}</div>
              </article>
            ))}
          </div>

          <div className="mt-8 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
            <article className="rounded-2xl border border-white/10 bg-[#0d1017] p-6">
              <h2 className="font-semibold">Foundation status</h2>
              <div className="mt-5 space-y-3">
                {['Tenant-aware identity & sessions', 'RBAC permission engine', 'Subscription entitlements', 'Audit log', 'Transactional outbox', 'Feature flags'].map((item) => (
                  <div key={item} className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-sm">
                    <span className="text-zinc-300">{item}</span><span className="text-emerald-300">Ready</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-white/10 bg-[#0d1017] p-6">
              <h2 className="font-semibold">Entitlements</h2>
              <div className="mt-5 space-y-3">
                {session.capabilities.entitlements.map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-4 text-sm">
                    <span className="truncate font-mono text-xs text-zinc-400">{item.key}</span>
                    <span className={item.enabled ? 'text-emerald-300' : 'text-zinc-600'}>{item.enabled ? item.limitValue ?? 'On' : 'Off'}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
