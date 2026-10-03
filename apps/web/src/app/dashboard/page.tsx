'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Bot,
  Building2,
  Check,
  CircleDollarSign,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  type IconComponent,
} from '@/components/icons';
import { useEffect, useMemo, useState } from 'react';

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

type LaunchItem = {
  label: string;
  detail: string;
  href: string;
  icon: IconComponent;
  entitlement?: string;
};

const launches: LaunchItem[] = [
  { label: 'CRM', detail: 'Leads, deals and follow-up', href: '/crm', icon: Users },
  { label: 'WhatsApp', detail: 'Inbox and campaigns', href: '/whatsapp', icon: MessageCircleMore },
  { label: 'AI Agents', detail: 'Governed AI operations', href: '/ai-agents', icon: Bot },
  { label: 'Automations', detail: 'Durable workflows', href: '/automations', icon: Workflow },
  { label: 'Real Estate', detail: 'Buyer and property workspace', href: '/real-estate', icon: Building2, entitlement: 'extension.realestate' },
  { label: 'Business Billing', detail: 'Quotes and invoices', href: '/billing', icon: CircleDollarSign },
];

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData>();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/session', { cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace('/login');
          return undefined;
        }
        if (!response.ok) throw new Error('Unable to load workspace.');
        return (await response.json()) as SessionData;
      })
      .then((data) => {
        if (!cancelled && data) setSession(data);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const enabled = useMemo(
    () =>
      new Set(
        session?.capabilities.entitlements
          .filter((item) => item.enabled)
          .map((item) => item.key) ?? [],
      ),
    [session],
  );

  if (error) {
    return (
      <div className="route-state">
        <div className="route-state-card" role="alert">
          <ShieldCheck size={22} className="mx-auto text-red-300" />
          <h1 className="mt-4 text-xl font-semibold">Workspace unavailable</h1>
          <p className="mt-2 text-sm text-zinc-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="route-state" aria-busy="true">
        <div className="w-full max-w-6xl">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton mt-4 h-10 w-72" />
          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="skeleton h-28" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const org = session.organization.organization;
  const visibleLaunches = launches.filter(
    (item) => !item.entitlement || enabled.has(item.entitlement),
  );
  const userLimit = session.capabilities.entitlements.find(
    (item) => item.key === 'users.max',
  )?.limitValue;

  return (
    <main className="min-h-screen text-zinc-100">
      <div className="mx-auto max-w-[1700px] px-4 py-6 sm:px-7 sm:py-8 lg:px-9 lg:py-10">
        <section className="relative overflow-hidden rounded-[26px] border border-white/[0.07] bg-[#0d1017] p-6 sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-violet-500/[0.055] blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300">
                <Sparkles size={13} />
                Operating workspace
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                {org.name}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
                One governed operating layer for customer data, conversations,
                AI execution, automation and business operations.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.035] px-4 py-3">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-400/[0.08] text-emerald-300">
                <Check size={16} />
              </span>
              <div>
                <div className="text-xs font-semibold text-emerald-200">
                  Workspace ready
                </div>
                <div className="mt-0.5 text-[10px] text-emerald-300/50">
                  Tenant isolation active
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Primary workspace"
            value={session.organization.workspaces[0]?.name ?? 'Main'}
            detail={session.organization.workspaces.length + ' workspace(s)'}
            icon={Building2}
          />
          <Metric
            label="Team structure"
            value={String(session.organization.teams.length)}
            detail={session.organization.branches.length + ' branch(es)'}
            icon={Users}
          />
          <Metric
            label="Human seat allowance"
            value={userLimit === null || userLimit === undefined ? 'Flexible' : String(userLimit)}
            detail="Plan and add-on controlled"
            icon={ShieldCheck}
          />
          <Metric
            label="Enabled capabilities"
            value={String(enabled.size)}
            detail="Commercial entitlements"
            icon={Sparkles}
          />
        </div>

        <div className="mt-7 grid gap-6 2xl:grid-cols-[1.35fr_.65fr]">
          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">Open a workspace</div>
                <div className="mt-1 text-xs text-zinc-600">
                  Your most important operating surfaces.
                </div>
              </div>
              <div className="text-[10px] text-zinc-700">⌘K for quick navigation</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleLaunches.map((item) => (
                <LaunchCard key={item.href} item={item} />
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0d1017] p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Platform controls</div>
                <div className="mt-1 text-xs text-zinc-600">
                  Foundation services protecting this tenant.
                </div>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-zinc-500">
                <ShieldCheck size={17} />
              </span>
            </div>
            <div className="mt-5 divide-y divide-white/[0.055]">
              {[
                ['Tenant identity', 'Session-bound'],
                ['RBAC & scope', 'Enforced'],
                ['Entitlements', 'Plan-derived'],
                ['Audit trail', 'Active'],
                ['Transactional outbox', 'Active'],
                ['Feature controls', 'Provider governed'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-3">
                  <span className="text-xs text-zinc-500">{label}</span>
                  <span className="text-[11px] font-medium text-zinc-300">{value}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-7 rounded-2xl border border-white/[0.07] bg-[#0d1017] p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Capability ledger</div>
              <div className="mt-1 text-xs text-zinc-600">
                What this tenant can use right now.
              </div>
            </div>
            <Link
              href="/subscription"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-400 hover:bg-white/[0.04]"
            >
              Manage plan
              <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {session.capabilities.entitlements.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.055] bg-white/[0.018] px-4 py-3"
              >
                <span className="truncate font-mono text-[10px] text-zinc-500">
                  {item.key}
                </span>
                <span
                  className={
                    item.enabled
                      ? 'text-[10px] font-medium text-emerald-300'
                      : 'text-[10px] text-zinc-700'
                  }
                >
                  {item.enabled ? item.limitValue ?? 'Enabled' : 'Off'}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: IconComponent;
}) {
  return (
    <article className="rounded-2xl border border-white/[0.07] bg-[#0d1017] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
            {label}
          </div>
          <div className="mt-3 truncate text-xl font-semibold tracking-tight text-zinc-100">
            {value}
          </div>
          <div className="mt-1 text-[11px] text-zinc-600">{detail}</div>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.065] bg-white/[0.02] text-zinc-500">
          <Icon size={16} />
        </span>
      </div>
    </article>
  );
}

function LaunchCard({ item }: { item: LaunchItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="group rounded-2xl border border-white/[0.07] bg-[#0d1017] p-5 transition hover:-translate-y-0.5 hover:border-white/[0.13] hover:bg-[#10141b]"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-violet-400/[0.12] bg-violet-400/[0.055] text-violet-300">
          <Icon size={18} />
        </span>
        <ArrowUpRight
          size={15}
          className="text-zinc-700 transition group-hover:text-zinc-400"
        />
      </div>
      <div className="mt-5 text-sm font-semibold text-zinc-200">{item.label}</div>
      <div className="mt-1 text-[11px] text-zinc-600">{item.detail}</div>
    </Link>
  );
}