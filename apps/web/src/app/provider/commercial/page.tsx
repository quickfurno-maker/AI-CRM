'use client';

import Link from 'next/link';
import { WorkspaceLoading } from '@/components/workspace-states';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type Metrics = {
  activeSubscriptions: number;
  trialing: number;
  pastDue: number;
  mrr: number;
  arr: number;
  trialConversion30d: { starts: number; conversions: number; rate: number | null };
  churnEvents30d: number;
  failedPaymentsOpen: number;
  outstandingInvoices: number;
  outstandingAmount: number;
};

type PaymentOps = {
  gateway: {
    mode: string;
    provider: string;
    enabled: boolean;
    activationPending: boolean;
    capabilities: {
      oneTimeCheckout: boolean;
      invoiceRecovery: boolean;
      signedWebhooks: boolean;
      refunds: boolean;
      recurringMandates: boolean;
    };
  };
  intents: Array<{
    id: string;
    purpose: string;
    provider: string;
    providerOrderId?: string | null;
    providerPaymentId?: string | null;
    amount: string;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    status: string;
    provider: string;
    providerPaymentId?: string | null;
    receivedAt: string;
  }>;
  refunds: Array<{
    id: string;
    receiptId: string;
    providerRefundId?: string | null;
    amount: string;
    currency: string;
    status: string;
    createdAt: string;
  }>;
};

type Catalog = {
  plans: Array<{
    id: string;
    key: string;
    name: string;
    isActive: boolean;
    prices: Array<{
      id: string;
      billingCycle: string;
      currency: string;
      amount: string;
      status: string;
      trialDays: number;
    }>;
    meters: Array<{
      id: string;
      meterKey: string;
      unit: string;
      includedQuantity: string;
      unitAmount: string;
      currency: string;
      enforcementMode: string;
      isActive: boolean;
    }>;
  }>;
  addons: Array<{
    id: string;
    key: string;
    name: string;
    entitlementKey: string;
    entitlementMode: string;
    unitsPerQuantity: number;
    isActive: boolean;
    prices: Array<{
      id: string;
      billingCycle: string;
      currency: string;
      amount: string;
      status: string;
    }>;
  }>;
  coupons: Array<{
    id: string;
    code: string;
    name: string;
    discountType: string;
    discountValue: string;
    duration: string;
    isActive: boolean;
  }>;
};

const field =
  'h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-violet-400/50';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/platform-admin/saas/' + path, {
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

function money(value: number | string, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export default function CommercialOpsPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean>();
  const [catalog, setCatalog] = useState<Catalog>();
  const [metrics, setMetrics] = useState<Metrics>();
  const [payments, setPayments] = useState<PaymentOps>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const sessionResponse = await fetch('/api/session', { cache: 'no-store' });
      if (sessionResponse.status === 401) {
        router.replace('/login');
        return;
      }
      const session = (await sessionResponse.json()) as {
        organization: { isPlatformAdmin?: boolean };
      };
      if (session.organization.isPlatformAdmin !== true) {
        setAuthorized(false);
        return;
      }
      setAuthorized(true);
      const [nextCatalog, nextMetrics, nextPayments] = await Promise.all([
        api<Catalog>('catalog'),
        api<Metrics>('metrics'),
        api<PaymentOps>('payment-gateway'),
      ]);
      setCatalog(nextCatalog);
      setMetrics(nextMetrics);
      setPayments(nextPayments);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load commercial operations.');
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(
    key: string,
    path: string,
    event: FormEvent<HTMLFormElement>,
    build: (data: FormData) => Record<string, unknown>,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await api(path, {
        method: 'POST',
        body: JSON.stringify(build(data)),
      });
      setNotice('Commercial configuration saved.');
      form.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save commercial configuration.');
    } finally {
      setBusy('');
    }
  }

  async function requestRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy('refund');
    setError('');
    setNotice('');
    try {
      await api('payment-gateway/refunds', {
        method: 'POST',
        body: JSON.stringify({
          receiptId: data.get('receiptId'),
          amount: data.get('amount'),
          reason: data.get('reason') || undefined,
          idempotencyKey:
            'provider-refund-' + globalThis.crypto.randomUUID(),
        }),
      });
      setNotice('Refund submitted to the payment gateway.');
      form.reset();
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to submit refund.',
      );
    } finally {
      setBusy('');
    }
  }

  if (authorized === false) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#07090d] p-6 text-zinc-100">
        <div className="max-w-xl rounded-3xl border border-white/10 bg-[#0d1017] p-8">
          <h1 className="text-2xl font-semibold">Provider access required</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-500">
            SaaS plan pricing, metering, coupons and commercial KPIs are provider-only controls.
          </p>
          <Link href="/dashboard" className="mt-5 inline-flex rounded-xl border border-white/10 px-4 py-2 text-sm">
            Command Center
          </Link>
        </div>
      </main>
    );
  }

  if (authorized === undefined || !catalog || !metrics || !payments) {
    return <WorkspaceLoading label="Commercial Operations" />;
  }

  return (
    <main className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto max-w-[1800px] p-4 sm:p-7 lg:p-9">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
              Provider · SaaS commercial engine
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Commercial Operations</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Configure plans, prices, usage policy, add-ons and coupons. Payment collection remains provider-adapter driven; this console does not fabricate successful payments.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/provider" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300">Provider</Link>
            <Link href="/dashboard" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300">Command Center</Link>
          </div>
        </header>

        {error ? <Alert tone="red">{error}</Alert> : null}
        {notice ? <Alert tone="green">{notice}</Alert> : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Active subscriptions" value={String(metrics.activeSubscriptions)} />
          <Metric label="MRR" value={money(metrics.mrr)} />
          <Metric label="ARR" value={money(metrics.arr)} />
          <Metric label="Trials" value={String(metrics.trialing)} />
          <Metric label="Past due" value={String(metrics.pastDue)} />
          <Metric label="Open dunning" value={String(metrics.failedPaymentsOpen)} />
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
          <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">Payment Gateway Operations</h2>
                <p className="mt-1 text-xs leading-5 text-zinc-600">
                  Signed provider events settle the existing SaaS commercial ledger.
                  Browser redirects never mark payments paid.
                </p>
              </div>
              <div
                className={
                  'rounded-full border px-3 py-1.5 text-[10px] font-semibold ' +
                  (payments.gateway.enabled
                    ? 'border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-200'
                    : 'border-amber-400/15 bg-amber-400/[0.05] text-amber-200')
                }
              >
                {payments.gateway.provider.toUpperCase()} ·{' '}
                {payments.gateway.enabled
                  ? payments.gateway.mode.toUpperCase()
                  : 'ACTIVATION PENDING'}
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Payment intents"
                value={String(payments.intents.length)}
              />
              <Metric
                label="Gateway events"
                value={String(payments.events.length)}
              />
              <Metric
                label="Refund records"
                value={String(payments.refunds.length)}
              />
              <Metric
                label="Signed webhooks"
                value={
                  payments.gateway.capabilities.signedWebhooks
                    ? 'Enabled'
                    : 'Pending'
                }
              />
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border border-white/[0.07]">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-white/[0.025] text-zinc-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Intent</th>
                    <th className="px-4 py-3 font-medium">Purpose</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Provider order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.055]">
                  {payments.intents.slice(0, 12).map((intent) => (
                    <tr key={intent.id}>
                      <td className="px-4 py-3 font-mono text-[10px] text-zinc-500">
                        {intent.id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{intent.purpose}</td>
                      <td className="px-4 py-3 text-zinc-300">
                        {money(intent.amount, intent.currency)}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{intent.status}</td>
                      <td className="max-w-48 truncate px-4 py-3 font-mono text-[10px] text-zinc-600">
                        {intent.providerOrderId ?? '—'}
                      </td>
                    </tr>
                  ))}
                  {!payments.intents.length ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-600">
                        No gateway payment intents yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
            <h2 className="font-semibold">Provider refund</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              Refunds use the original provider payment. They do not silently cancel
              a subscription or alter entitlement policy.
            </p>
            <form onSubmit={requestRefund} className="mt-5 grid gap-3">
              <input
                className={field}
                name="receiptId"
                placeholder="SaaS receipt UUID"
                required
              />
              <input
                className={field}
                name="amount"
                inputMode="decimal"
                placeholder="Refund amount"
                required
              />
              <textarea
                className="min-h-24 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white outline-none"
                name="reason"
                placeholder="Reason / operator note"
              />
              <button
                disabled={busy !== '' || !payments.gateway.enabled}
                className="h-10 rounded-xl border border-red-400/20 bg-red-400/[0.07] text-sm font-semibold text-red-200 disabled:opacity-40"
              >
                Submit verified refund
              </button>
            </form>
            {!payments.gateway.enabled ? (
              <div className="mt-3 text-[11px] leading-5 text-amber-200/60">
                Internal refund workflow is ready; live provider credentials are not activated.
              </div>
            ) : null}

            <div className="mt-6 border-t border-white/[0.07] pt-4">
              <div className="text-xs font-semibold text-zinc-300">Recent refunds</div>
              <div className="mt-3 grid gap-2">
                {payments.refunds.slice(0, 6).map((refund) => (
                  <div
                    key={refund.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] px-3 py-2"
                  >
                    <div>
                      <div className="text-xs text-zinc-300">
                        {money(refund.amount, refund.currency)}
                      </div>
                      <div className="mt-0.5 font-mono text-[9px] text-zinc-700">
                        {refund.receiptId.slice(0, 8)}
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-500">{refund.status}</span>
                  </div>
                ))}
                {!payments.refunds.length ? (
                  <div className="text-xs text-zinc-700">No refunds recorded.</div>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-3">
          <ConfigCard title="Plan">
            <form onSubmit={(event) => void submit('plan', 'plans', event, (data) => ({
              key: data.get('key'),
              name: data.get('name'),
              isActive: data.get('isActive') === 'on',
            }))} className="grid gap-3">
              <input className={field} name="key" placeholder="starter" required />
              <input className={field} name="name" placeholder="Starter" required />
              <Check name="isActive" label="Active" />
              <Save busy={busy !== ''} label="Save plan" />
            </form>
          </ConfigCard>

          <ConfigCard title="Plan price">
            <form onSubmit={(event) => void submit('price', 'plan-prices', event, (data) => ({
              planId: data.get('planId'),
              billingCycle: data.get('billingCycle'),
              currency: String(data.get('currency') || 'INR').toUpperCase(),
              amount: data.get('amount'),
              taxRatePercent: data.get('taxRatePercent') || '0',
              status: data.get('status'),
              trialDays: Number(data.get('trialDays') || 0),
            }))} className="grid gap-3">
              <PlanSelect plans={catalog.plans} />
              <select className={field} name="billingCycle" defaultValue="MONTHLY"><option>MONTHLY</option><option>YEARLY</option></select>
              <div className="grid grid-cols-2 gap-3">
                <input className={field} name="currency" defaultValue="INR" placeholder="INR" required />
                <input className={field} name="amount" inputMode="decimal" placeholder="Amount" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input className={field} name="taxRatePercent" inputMode="decimal" defaultValue="18" placeholder="Tax %" />
                <input className={field} name="trialDays" type="number" min="0" max="365" defaultValue="0" placeholder="Trial days" />
              </div>
              <select className={field} name="status" defaultValue="ACTIVE"><option>DRAFT</option><option>ACTIVE</option><option>ARCHIVED</option></select>
              <Save busy={busy !== ''} label="Save price" />
            </form>
          </ConfigCard>

          <ConfigCard title="Usage meter">
            <form onSubmit={(event) => void submit('meter', 'meters', event, (data) => ({
              planId: data.get('planId'),
              meterKey: data.get('meterKey'),
              unit: data.get('unit') || 'unit',
              currency: String(data.get('currency') || 'INR').toUpperCase(),
              includedQuantity: data.get('includedQuantity'),
              unitAmount: data.get('unitAmount'),
              warningThresholdPercent: Number(data.get('warningThresholdPercent') || 80),
              enforcementMode: data.get('enforcementMode'),
              isActive: true,
            }))} className="grid gap-3">
              <PlanSelect plans={catalog.plans} />
              <input className={field} name="meterKey" placeholder="ai.agent_runs" required />
              <input className={field} name="unit" placeholder="run" />
              <div className="grid grid-cols-2 gap-3">
                <input className={field} name="includedQuantity" placeholder="1000" required />
                <input className={field} name="unitAmount" placeholder="0.50" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input className={field} name="currency" defaultValue="INR" />
                <input className={field} name="warningThresholdPercent" type="number" min="1" max="100" defaultValue="80" />
              </div>
              <select className={field} name="enforcementMode" defaultValue="OVERAGE"><option>OVERAGE</option><option>THROTTLE</option><option>HARD_LIMIT</option></select>
              <Save busy={busy !== ''} label="Save meter" />
            </form>
          </ConfigCard>

          <ConfigCard title="Add-on">
            <form onSubmit={(event) => void submit('addon', 'addons', event, (data) => ({
              key: data.get('key'),
              name: data.get('name'),
              description: data.get('description') || undefined,
              entitlementKey: data.get('entitlementKey'),
              entitlementMode: data.get('entitlementMode'),
              unitsPerQuantity: Number(data.get('unitsPerQuantity') || 1),
              isActive: true,
            }))} className="grid gap-3">
              <input className={field} name="key" placeholder="ai.whatsapp" required />
              <input className={field} name="name" placeholder="AI WhatsApp" required />
              <input className={field} name="description" placeholder="Description" />
              <input className={field} name="entitlementKey" placeholder="ai.whatsapp.enabled" required />
              <select className={field} name="entitlementMode" defaultValue="ENABLE"><option>ENABLE</option><option>LIMIT_INCREMENT</option></select>
              <input className={field} name="unitsPerQuantity" type="number" min="1" defaultValue="1" />
              <Save busy={busy !== ''} label="Save add-on" />
            </form>
          </ConfigCard>

          <ConfigCard title="Add-on price">
            <form onSubmit={(event) => void submit('addon-price', 'addon-prices', event, (data) => ({
              addonId: data.get('addonId'),
              billingCycle: data.get('billingCycle'),
              currency: String(data.get('currency') || 'INR').toUpperCase(),
              amount: data.get('amount'),
              taxRatePercent: data.get('taxRatePercent') || '0',
              status: data.get('status'),
            }))} className="grid gap-3">
              <select className={field} name="addonId" required defaultValue="">
                <option value="" disabled>Select add-on</option>
                {catalog.addons.map((addon) => <option key={addon.id} value={addon.id}>{addon.name}</option>)}
              </select>
              <select className={field} name="billingCycle" defaultValue="MONTHLY"><option>MONTHLY</option><option>YEARLY</option></select>
              <div className="grid grid-cols-2 gap-3">
                <input className={field} name="currency" defaultValue="INR" />
                <input className={field} name="amount" placeholder="Amount" required />
              </div>
              <input className={field} name="taxRatePercent" defaultValue="18" placeholder="Tax %" />
              <select className={field} name="status" defaultValue="ACTIVE"><option>DRAFT</option><option>ACTIVE</option><option>ARCHIVED</option></select>
              <Save busy={busy !== ''} label="Save add-on price" />
            </form>
          </ConfigCard>

          <ConfigCard title="Coupon">
            <form onSubmit={(event) => void submit('coupon', 'coupons', event, (data) => ({
              code: String(data.get('code') || '').toUpperCase(),
              name: data.get('name'),
              discountType: data.get('discountType'),
              discountValue: data.get('discountValue'),
              currency: data.get('discountType') === 'FIXED' ? String(data.get('currency') || 'INR').toUpperCase() : undefined,
              duration: data.get('duration'),
              maxRedemptions: data.get('maxRedemptions') ? Number(data.get('maxRedemptions')) : undefined,
              isActive: true,
            }))} className="grid gap-3">
              <input className={field} name="code" placeholder="LAUNCH20" required />
              <input className={field} name="name" placeholder="Launch offer" required />
              <select className={field} name="discountType" defaultValue="PERCENT"><option>PERCENT</option><option>FIXED</option></select>
              <div className="grid grid-cols-2 gap-3">
                <input className={field} name="discountValue" placeholder="20" required />
                <input className={field} name="currency" defaultValue="INR" />
              </div>
              <select className={field} name="duration" defaultValue="ONCE"><option>ONCE</option><option>FOREVER</option><option>REPEATING</option></select>
              <input className={field} name="maxRedemptions" type="number" min="1" placeholder="Max redemptions" />
              <Save busy={busy !== ''} label="Save coupon" />
            </form>
          </ConfigCard>
        </div>

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold">Commercial catalog snapshot</h2>
              <p className="mt-1 text-xs text-zinc-600">Provider truth used by checkout, entitlement reconciliation and usage policy.</p>
            </div>
            <div className="text-xs text-zinc-500">
              30d trial conversion: {metrics.trialConversion30d.rate === null ? '—' : metrics.trialConversion30d.rate + '%'} · Churn events: {metrics.churnEvents30d}
            </div>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {catalog.plans.map((plan) => (
              <article key={plan.id} className="rounded-xl border border-white/[0.07] p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{plan.name}</div>
                  <div className={plan.isActive ? 'text-xs text-emerald-300' : 'text-xs text-zinc-600'}>{plan.isActive ? 'ACTIVE' : 'INACTIVE'}</div>
                </div>
                <div className="mt-2 text-xs text-zinc-600">
                  {plan.prices.map((price) => price.billingCycle + ' ' + money(price.amount, price.currency) + ' ' + price.status).join(' · ') || 'No prices'}
                </div>
                <div className="mt-3 space-y-1 font-mono text-[11px] text-zinc-500">
                  {plan.meters.map((meter) => (
                    <div key={meter.id}>{meter.meterKey}: {meter.includedQuantity} included · {meter.enforcementMode}</div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <h2 className="font-semibold">Coupons</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {catalog.coupons.map((coupon) => (
              <div key={coupon.id} className="rounded-xl border border-white/[0.07] p-4">
                <div className="font-mono text-sm text-violet-300">{coupon.code}</div>
                <div className="mt-1 text-xs text-zinc-400">{coupon.name}</div>
                <div className="mt-3 text-xs text-zinc-600">{coupon.discountValue} {coupon.discountType} · {coupon.duration}</div>
              </div>
            ))}
            {!catalog.coupons.length ? <div className="text-sm text-zinc-600">No coupons configured.</div> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function ConfigCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PlanSelect({ plans }: { plans: Catalog['plans'] }) {
  return (
    <select className={field} name="planId" required defaultValue="">
      <option value="" disabled>Select plan</option>
      {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
    </select>
  );
}

function Check({ name, label }: { name: string; label: string }) {
  return <label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" name={name} />{label}</label>;
}

function Save({ busy, label }: { busy: boolean; label: string }) {
  return <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-50">{label}</button>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className="mt-2 truncate text-lg font-semibold">{value}</div>
    </article>
  );
}

function Alert({ tone, children }: { tone: 'red' | 'green'; children: string }) {
  return (
    <div className={'mt-5 rounded-xl border px-4 py-3 text-sm ' + (tone === 'red' ? 'border-red-400/20 bg-red-400/10 text-red-200' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100')}>
      {children}
    </div>
  );
}
