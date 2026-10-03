'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { WorkspaceLoading } from '@/components/workspace-states';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Overview = {
  range: { from: string; to: string; workspaceId?: string | null };
  finance: {
    invoiced: number;
    collected: number;
    outstanding: number;
    overdue: number;
    invoiceCount: number;
    paidInvoiceCount: number;
    collectionRate: number;
  };
  crm: {
    leadsCreated: number;
    qualifiedLeads: number;
    hotLeads: number;
    dealsCreated: number;
    wonDeals: number;
    lostDeals: number;
    openPipeline: number;
    wonValue: number;
    winRate: number;
  };
  communication: {
    conversations: number;
    inboundMessages: number;
    outboundMessages: number;
    deliveredMessages: number;
    failedMessages: number;
    messageSuccessRate: number;
    campaigns: number;
    campaignRecipients: number;
    campaignSent: number;
    campaignFailed: number;
  };
  ai: {
    runs: number;
    completed: number;
    failed: number;
    totalTokens: number;
    estimatedCostUsd: number;
    averageLatencyMs: number;
    successRate: number;
  };
  attendance: {
    records: number;
    present: number;
    absent: number;
    leave: number;
    workHours: number;
    lateMinutes: number;
    overtimeHours: number;
  };
  realEstate: {
    requirements: number;
    siteVisits: number;
    completedVisits: number;
    bookings: number;
    confirmedBookings: number;
    confirmedBookingAmount: number;
  };
  salespeople: Array<{
    memberId: string;
    displayName: string;
    leads: number;
    openDeals: number;
    wonDeals: number;
    pipelineValue: number;
    wonValue: number;
  }>;
  receivablesAging: {
    current: number;
    days1To30: number;
    days31To60: number;
    days61To90: number;
    days90Plus: number;
  };
  timeseries: Array<{
    day: string;
    collected: number;
    invoiced: number;
    wonValue: number;
  }>;
};

async function analytics(path: string): Promise<Overview> {
  const response = await fetch('/api/analytics/' + path, { cache: 'no-store' });
  if (response.status === 401) throw new Error('AUTH');
  const body = (await response.json()) as Overview & {
    message?: string | string[];
  };
  if (!response.ok) {
    const message = Array.isArray(body.message)
      ? body.message.join(' ')
      : body.message;
    throw new Error(message ?? 'Unable to load analytics.');
  }
  return body;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Overview>();
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const to = new Date();
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      const result = await analytics(
        'overview?from=' +
          encodeURIComponent(from.toISOString()) +
          '&to=' +
          encodeURIComponent(to.toISOString()),
      );
      setData(result);
      setError('');
    } catch (reason) {
      if (reason instanceof Error && reason.message === 'AUTH') {
        router.replace('/login');
        return;
      }
      setError(
        reason instanceof Error ? reason.message : 'Unable to load analytics.',
      );
    }
  }, [days, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const maxDaily = useMemo(
    () =>
      Math.max(
        1,
        ...(data?.timeseries ?? []).map((row) =>
          Math.max(row.collected, row.invoiced, row.wonValue),
        ),
      ),
    [data],
  );

  if (!data && !error) {
    return <WorkspaceLoading label="Analytics" />;
  }

  return (
    <main className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto grid min-h-screen max-w-[1800px] lg:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-white/10 bg-[#0b0e14] p-5 lg:block">
          <div className="mb-8 px-2">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
              Business OS
            </div>
            <div className="mt-2 text-lg font-semibold">Analytics</div>
            <div className="mt-1 text-xs text-zinc-600">Cross-domain intelligence</div>
          </div>
          <nav className="space-y-1 text-sm">
            <Link href="/dashboard" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              Command Center
            </Link>
            <Link href="/crm" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              CRM
            </Link>
            <Link href="/billing" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              Billing
            </Link>
            <div className="rounded-xl bg-violet-400/10 px-3 py-2.5 text-violet-200">
              Analytics
            </div>
            <Link href="/ai-agents" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              AI Agents
            </Link>
          </nav>
        </aside>

        <section className="min-w-0 p-4 sm:p-7 lg:p-9">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Advanced Reporting
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Business intelligence
              </h1>
              <p className="mt-2 text-sm text-zinc-500">
                Canonical finance, funnel, WhatsApp, AI, attendance and
                Real Estate metrics from one governed reporting layer.
              </p>
            </div>
            <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.025] p-1">
              {[7, 30, 90].map((value) => (
                <button
                  key={value}
                  onClick={() => setDays(value)}
                  className={
                    'rounded-lg px-3 py-2 text-xs ' +
                    (days === value
                      ? 'bg-violet-400/10 text-violet-200'
                      : 'text-zinc-500')
                  }
                >
                  {value}D
                </button>
              ))}
            </div>
          </header>

          {error ? (
            <div role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {!data ? (
            <div className="mt-12 text-center text-sm text-zinc-600">
              Loading analytics…
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Collected" value={money(data.finance.collected)} note={data.finance.collectionRate + '% collection'} />
                <Metric label="Outstanding" value={money(data.finance.outstanding)} note={money(data.finance.overdue) + ' overdue'} />
                <Metric label="Open pipeline" value={money(data.crm.openPipeline)} note={data.crm.winRate + '% deal win rate'} />
                <Metric label="Won value" value={money(data.crm.wonValue)} note={data.crm.wonDeals + ' won deals'} />
              </div>

              <div className="mt-6 grid gap-5 xl:grid-cols-2">
                <Panel title="Sales funnel">
                  <Grid>
                    <Small label="Leads" value={data.crm.leadsCreated} />
                    <Small label="Qualified" value={data.crm.qualifiedLeads} />
                    <Small label="Hot" value={data.crm.hotLeads} />
                    <Small label="Deals" value={data.crm.dealsCreated} />
                    <Small label="Won" value={data.crm.wonDeals} />
                    <Small label="Lost" value={data.crm.lostDeals} />
                  </Grid>
                </Panel>

                <Panel title="WhatsApp & campaigns">
                  <Grid>
                    <Small label="Conversations" value={data.communication.conversations} />
                    <Small label="Inbound" value={data.communication.inboundMessages} />
                    <Small label="Outbound" value={data.communication.outboundMessages} />
                    <Small label="Success" value={data.communication.messageSuccessRate + '%'} />
                    <Small label="Campaigns" value={data.communication.campaigns} />
                    <Small label="Recipients" value={data.communication.campaignRecipients} />
                  </Grid>
                </Panel>

                <Panel title="AI operations">
                  <Grid>
                    <Small label="Runs" value={data.ai.runs} />
                    <Small label="Success" value={data.ai.successRate + '%'} />
                    <Small label="Tokens" value={data.ai.totalTokens.toLocaleString('en-IN')} />
                    <Small label="Cost" value={'$' + data.ai.estimatedCostUsd.toFixed(4)} />
                    <Small label="Avg latency" value={data.ai.averageLatencyMs + ' ms'} />
                    <Small label="Failed" value={data.ai.failed} />
                  </Grid>
                </Panel>

                <Panel title="Attendance">
                  <Grid>
                    <Small label="Present" value={data.attendance.present} />
                    <Small label="Absent" value={data.attendance.absent} />
                    <Small label="Leave" value={data.attendance.leave} />
                    <Small label="Work hours" value={data.attendance.workHours} />
                    <Small label="Late min" value={data.attendance.lateMinutes} />
                    <Small label="Overtime h" value={data.attendance.overtimeHours} />
                  </Grid>
                </Panel>

                <Panel title="Real Estate">
                  <Grid>
                    <Small label="Requirements" value={data.realEstate.requirements} />
                    <Small label="Site visits" value={data.realEstate.siteVisits} />
                    <Small label="Completed visits" value={data.realEstate.completedVisits} />
                    <Small label="Bookings" value={data.realEstate.bookings} />
                    <Small label="Confirmed" value={data.realEstate.confirmedBookings} />
                    <Small label="Booking amount" value={money(data.realEstate.confirmedBookingAmount)} />
                  </Grid>
                </Panel>

                <Panel title="Receivables aging">
                  <Grid>
                    <Small label="Current" value={money(data.receivablesAging.current)} />
                    <Small label="1–30 days" value={money(data.receivablesAging.days1To30)} />
                    <Small label="31–60 days" value={money(data.receivablesAging.days31To60)} />
                    <Small label="61–90 days" value={money(data.receivablesAging.days61To90)} />
                    <Small label="90+ days" value={money(data.receivablesAging.days90Plus)} />
                  </Grid>
                </Panel>
              </div>

              <section className="mt-6 rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">Daily commercial pulse</h2>
                    <p className="mt-1 text-xs text-zinc-600">
                      Invoiced, collected and won-deal value.
                    </p>
                  </div>
                </div>
                <div className="mt-5 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                  {data.timeseries.map((row) => (
                    <div key={row.day} className="grid grid-cols-[90px_1fr] items-center gap-3">
                      <span className="text-[11px] text-zinc-600">
                        {new Date(row.day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </span>
                      <div className="grid gap-1">
                        <Bar label="Collected" value={row.collected} max={maxDaily} />
                        <Bar label="Invoiced" value={row.invoiced} max={maxDaily} />
                        <Bar label="Won" value={row.wonValue} max={maxDaily} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-6 rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                <h2 className="font-semibold">Salesperson performance</h2>
                <div className="mt-4 overflow-x-auto">
                  <div className="min-w-[760px]">
                    <div className="grid grid-cols-[1.5fr_.6fr_.6fr_.8fr_.8fr] gap-3 border-b border-white/[0.07] px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                      <span>Member</span><span>Leads</span><span>Won</span><span>Pipeline</span><span>Won value</span>
                    </div>
                    {data.salespeople.map((person) => (
                      <div key={person.memberId} className="grid grid-cols-[1.5fr_.6fr_.6fr_.8fr_.8fr] gap-3 border-b border-white/[0.05] px-3 py-3 text-sm last:border-0">
                        <span>{person.displayName}</span>
                        <span className="text-zinc-500">{person.leads}</span>
                        <span className="text-zinc-500">{person.wonDeals}</span>
                        <span className="text-zinc-400">{money(person.pipelineValue)}</span>
                        <span className="text-emerald-300">{money(person.wonValue)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <div className="mt-6 rounded-2xl border border-violet-400/15 bg-violet-400/[0.035] p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">
                  AI Analytics Assistant
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
                  The governed AI tool <span className="font-mono text-zinc-300">get_business_analytics</span>{' '}
                  reads this exact reporting layer. AI agents can explain trends or answer business questions without direct database access or inventing metrics.
                </p>
                <Link
                  href="/ai-agents"
                  className="mt-4 inline-flex rounded-xl border border-violet-400/20 px-4 py-2 text-sm text-violet-200"
                >
                  Configure AI agent access
                </Link>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-zinc-600">{note}</div>
    </article>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>;
}

function Small({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = Math.max(value > 0 ? 2 : 0, Math.min(100, (value / max) * 100));
  return (
    <div className="grid grid-cols-[60px_1fr_110px] items-center gap-2 text-[10px]">
      <span className="text-zinc-600">{label}</span>
      <div className="h-1.5 rounded-full bg-white/[0.05]">
        <div className="h-1.5 rounded-full bg-white/30" style={{ width: width + '%' }} />
      </div>
      <span className="text-right text-zinc-500">{money(value)}</span>
    </div>
  );
}

function money(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}
