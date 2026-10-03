'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type Price = {
  id: string;
  planId?: string;
  addonId?: string;
  billingCycle: 'MONTHLY' | 'YEARLY';
  currency: string;
  amount: string;
  status: string;
  trialDays?: number;
};

type Catalog = {
  plans: Array<{
    id: string;
    key: string;
    name: string;
    prices: Price[];
  }>;
  addons: Array<{
    id: string;
    key: string;
    name: string;
    description?: string | null;
    entitlementKey: string;
    entitlementMode: string;
    unitsPerQuantity: number;
    prices: Price[];
  }>;
};

type UsageMeter = {
  meterKey: string;
  unit: string;
  used: number;
  included: number;
  remaining: number;
  overage: number;
  unitAmount: number;
  estimatedOverageAmount: number;
  currency: string;
  enforcementMode: string;
  warning: boolean;
};

type Portal = {
  subscription: {
    id: string;
    planId: string;
    status: string;
    billingCycle: string;
    currency: string;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    trialEndsAt?: string | null;
    cancelAtPeriodEnd: boolean;
  };
  plan: { id: string; key: string; name: string };
  billingProfile?: {
    legalName: string;
    billingEmail: string;
    billingPhone?: string | null;
    taxId?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country: string;
  } | null;
  addons: Array<{
    subscriptionAddon: {
      id: string;
      addonId: string;
      quantity: number;
      status: string;
      pendingQuantity?: number | null;
      pendingChangeAt?: string | null;
    };
    addon: {
      id: string;
      key: string;
      name: string;
    };
  }>;
  usage: {
    periodStart: string;
    periodEnd: string;
    meters: UsageMeter[];
  };
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    currency: string;
    total: string;
    balanceDue: string;
    createdAt: string;
  }>;
  receipts: Array<{
    id: string;
    receiptNumber: string;
    amount: string;
    currency: string;
    paidAt: string;
  }>;
  dunning: Array<{
    id: string;
    status: string;
    attemptCount: number;
    graceEndsAt?: string | null;
  }>;
};

const field =
  'h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-violet-400/50';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/saas/' + path, {
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

function checkoutKey(prefix: string, priceId: string) {
  return prefix + '-' + priceId + '-' + globalThis.crypto.randomUUID();
}

function money(value: string | number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export default function SubscriptionPage() {
  const router = useRouter();
  const [portal, setPortal] = useState<Portal>();
  const [catalog, setCatalog] = useState<Catalog>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [portalData, catalogData] = await Promise.all([
        api<Portal>('portal'),
        api<Catalog>('catalog'),
      ]);
      setPortal(portalData);
      setCatalog(catalogData);
    } catch (reason) {
      if (reason instanceof Error && reason.message === 'AUTH') {
        router.replace('/login');
        return;
      }
      setError(reason instanceof Error ? reason.message : 'Unable to load subscription.');
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const currentPrices = useMemo(
    () =>
      catalog?.plans
        .find((plan) => plan.id === portal?.subscription.planId)
        ?.prices.filter((price) => price.status === 'ACTIVE') ?? [],
    [catalog, portal],
  );

  async function saveBillingProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy('profile');
    setError('');
    setNotice('');
    try {
      await api('billing-profile', {
        method: 'PUT',
        body: JSON.stringify({
          legalName: data.get('legalName'),
          billingEmail: data.get('billingEmail'),
          billingPhone: data.get('billingPhone') || undefined,
          taxId: data.get('taxId') || undefined,
          addressLine1: data.get('addressLine1') || undefined,
          addressLine2: data.get('addressLine2') || undefined,
          city: data.get('city') || undefined,
          state: data.get('state') || undefined,
          postalCode: data.get('postalCode') || undefined,
          country: String(data.get('country') || 'IN').toUpperCase(),
        }),
      });
      setNotice('Billing profile saved.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save billing profile.');
    } finally {
      setBusy('');
    }
  }

  async function planAction(price: Price, mode: 'trial' | 'checkout' | 'schedule') {
    setBusy(price.id + mode);
    setError('');
    setNotice('');
    try {
      if (mode === 'trial') {
        await api('trials', {
          method: 'POST',
          body: JSON.stringify({ planPriceId: price.id }),
        });
        setNotice('Trial activated.');
      } else if (mode === 'schedule') {
        await api('subscription/change-plan', {
          method: 'POST',
          body: JSON.stringify({
            planPriceId: price.id,
            reason: 'Customer requested from subscription portal.',
          }),
        });
        setNotice('Plan change scheduled for period end.');
      } else {
        const checkout = await api<{
          id: string;
          total: string;
          currency: string;
          payment: { status: string };
        }>('checkouts/plan', {
          method: 'POST',
          body: JSON.stringify({
            planPriceId: price.id,
            idempotencyKey: checkoutKey('portal-plan', price.id),
          }),
        });
        setNotice(
          'Checkout ' +
            checkout.id +
            ' created for ' +
            money(checkout.total, checkout.currency) +
            '. Payment-provider activation is still pending.',
        );
      }
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update plan.');
    } finally {
      setBusy('');
    }
  }

  async function addonCheckout(price: Price, addonName: string) {
    setBusy(price.id + 'addon');
    setError('');
    setNotice('');
    try {
      const checkout = await api<{
        id: string;
        total: string;
        currency: string;
      }>('checkouts/addon', {
        method: 'POST',
        body: JSON.stringify({
          addonPriceId: price.id,
          quantity: 1,
          idempotencyKey: checkoutKey('portal-addon', price.id),
        }),
      });
      setNotice(
        addonName +
          ' checkout ' +
          checkout.id +
          ' created for ' +
          money(checkout.total, checkout.currency) +
          '. Payment-provider activation is still pending.',
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to purchase add-on.');
    } finally {
      setBusy('');
    }
  }

  async function cancelSubscription() {
    setBusy('cancel');
    setError('');
    setNotice('');
    try {
      await api('subscription/cancel', {
        method: 'POST',
        body: JSON.stringify({
          immediately: false,
          reason: 'Customer requested from subscription portal.',
        }),
      });
      setNotice('Cancellation scheduled for period end.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to cancel subscription.');
    } finally {
      setBusy('');
    }
  }

  async function reactivate() {
    setBusy('reactivate');
    setError('');
    try {
      await api('subscription/reactivate', { method: 'POST' });
      setNotice('Scheduled cancellation revoked.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to reactivate.');
    } finally {
      setBusy('');
    }
  }

  if (!portal || !catalog) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#07090d] text-sm text-zinc-500">
        Loading subscription…
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto max-w-[1700px] p-4 sm:p-7 lg:p-9">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
              SaaS subscription · separate from customer billing
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Plan, Add-ons & Usage</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Manage the plan you buy from Business OS. Quotes, invoices, and payments your company sends to its own customers remain under Business Billing.
            </p>
          </div>
          <Link href="/dashboard" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300">
            Command Center
          </Link>
        </header>

        {error ? <Alert tone="red">{error}</Alert> : null}
        {notice ? <Alert tone="green">{notice}</Alert> : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Current plan" value={portal.plan.name} detail={portal.subscription.billingCycle} />
          <Metric label="Status" value={portal.subscription.status} detail={portal.subscription.cancelAtPeriodEnd ? 'Cancels at period end' : 'Ongoing'} />
          <Metric label="Renewal / period end" value={portal.subscription.currentPeriodEnd ? new Date(portal.subscription.currentPeriodEnd).toLocaleDateString() : '—'} detail={portal.subscription.currency} />
          <Metric label="Open recovery cases" value={String(portal.dunning.length)} detail={portal.dunning.length ? 'Payment attention required' : 'No dunning case'} />
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
          <form onSubmit={saveBillingProfile} className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
            <h2 className="font-semibold">SaaS billing profile</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              Used only for invoices and receipts issued by our SaaS to your organization.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input className={field} name="legalName" defaultValue={portal.billingProfile?.legalName ?? ''} placeholder="Legal name" required />
              <input className={field} name="billingEmail" type="email" defaultValue={portal.billingProfile?.billingEmail ?? ''} placeholder="Billing email" required />
              <input className={field} name="billingPhone" defaultValue={portal.billingProfile?.billingPhone ?? ''} placeholder="Phone" />
              <input className={field} name="taxId" defaultValue={portal.billingProfile?.taxId ?? ''} placeholder="GST / tax ID" />
              <input className={field + ' sm:col-span-2'} name="addressLine1" defaultValue={portal.billingProfile?.addressLine1 ?? ''} placeholder="Address line 1" />
              <input className={field + ' sm:col-span-2'} name="addressLine2" defaultValue={portal.billingProfile?.addressLine2 ?? ''} placeholder="Address line 2" />
              <input className={field} name="city" defaultValue={portal.billingProfile?.city ?? ''} placeholder="City" />
              <input className={field} name="state" defaultValue={portal.billingProfile?.state ?? ''} placeholder="State" />
              <input className={field} name="postalCode" defaultValue={portal.billingProfile?.postalCode ?? ''} placeholder="Postal code" />
              <input className={field} name="country" defaultValue={portal.billingProfile?.country ?? 'IN'} placeholder="Country code" maxLength={2} />
              <button disabled={busy !== ''} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-50 sm:col-span-2">
                Save billing profile
              </button>
            </div>
          </form>

          <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Usage this period</h2>
                <p className="mt-1 text-xs text-zinc-600">
                  {new Date(portal.usage.periodStart).toLocaleDateString()} – {new Date(portal.usage.periodEnd).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {portal.usage.meters.map((meter) => {
                const percent = meter.included > 0 ? Math.min(100, (meter.used / meter.included) * 100) : 0;
                return (
                  <div key={meter.meterKey} className="rounded-xl border border-white/[0.07] p-4">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-mono text-xs text-zinc-300">{meter.meterKey}</span>
                      <span className={meter.warning ? 'text-amber-300' : 'text-zinc-400'}>
                        {meter.used} / {meter.included} {meter.unit}
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-violet-300" style={{ width: percent + '%' }} />
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] text-zinc-600">
                      <span>{meter.enforcementMode}</span>
                      <span>
                        {meter.overage > 0
                          ? money(meter.estimatedOverageAmount, meter.currency) + ' estimated overage'
                          : meter.remaining + ' remaining'}
                      </span>
                    </div>
                  </div>
                );
              })}
              {!portal.usage.meters.length ? <div className="py-8 text-center text-sm text-zinc-600">No metered allowances configured.</div> : null}
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <h2 className="font-semibold">Available plans</h2>
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            {catalog.plans.map((plan) => (
              <article key={plan.id} className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{plan.name}</h3>
                  {plan.id === portal.subscription.planId ? <span className="text-xs text-emerald-300">Current</span> : null}
                </div>
                <div className="mt-4 space-y-3">
                  {plan.prices.filter((price) => price.status === 'ACTIVE').map((price) => {
                    const isCurrentCycle = plan.id === portal.subscription.planId && price.billingCycle === portal.subscription.billingCycle;
                    const trialAvailable = (price.trialDays ?? 0) > 0 && portal.subscription.status !== 'ACTIVE';
                    return (
                      <div key={price.id} className="rounded-xl border border-white/[0.07] p-3">
                        <div className="text-sm font-medium">{money(price.amount, price.currency)}</div>
                        <div className="mt-1 text-xs text-zinc-600">{price.billingCycle}{price.trialDays ? ' · ' + price.trialDays + '-day trial' : ''}</div>
                        {!isCurrentCycle ? (
                          <div className="mt-3 flex gap-2">
                            {trialAvailable ? (
                              <button disabled={busy !== ''} onClick={() => void planAction(price, 'trial')} className="rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-40">
                                Start trial
                              </button>
                            ) : null}
                            <button disabled={busy !== ''} onClick={() => void planAction(price, price.billingCycle === portal.subscription.billingCycle ? 'checkout' : 'schedule')} className="rounded-lg bg-violet-300 px-3 py-2 text-xs font-semibold text-zinc-950 disabled:opacity-40">
                              {price.billingCycle === portal.subscription.billingCycle ? 'Choose / upgrade' : 'Schedule cycle change'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {portal.subscription.cancelAtPeriodEnd ? (
              <button disabled={busy !== ''} onClick={() => void reactivate()} className="rounded-xl bg-emerald-300 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50">
                Keep subscription
              </button>
            ) : (
              <button disabled={busy !== ''} onClick={() => void cancelSubscription()} className="rounded-xl border border-red-400/20 px-4 py-2 text-sm text-red-300 disabled:opacity-50">
                Cancel at period end
              </button>
            )}
            <span className="self-center text-xs text-zinc-600">
              Current configured prices: {currentPrices.map((price) => price.billingCycle + ' ' + money(price.amount, price.currency)).join(' · ') || 'none'}
            </span>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <h2 className="font-semibold">Add-ons</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {catalog.addons.map((addon) => {
              const active = portal.addons.find((item) => item.addon.id === addon.id);
              const compatible = addon.prices.find(
                (price) =>
                  price.status === 'ACTIVE' &&
                  price.billingCycle === portal.subscription.billingCycle &&
                  price.currency === portal.subscription.currency,
              );
              return (
                <article key={addon.id} className="rounded-xl border border-white/[0.07] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{addon.name}</div>
                    <div className="text-xs text-violet-300">{active ? '× ' + active.subscriptionAddon.quantity : 'Not active'}</div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-zinc-600">{addon.description ?? addon.entitlementKey}</p>
                  {compatible ? (
                    <button disabled={busy !== ''} onClick={() => void addonCheckout(compatible, addon.name)} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-40">
                      Add 1 · {money(compatible.amount, compatible.currency)}
                    </button>
                  ) : (
                    <div className="mt-3 text-xs text-zinc-700">No compatible active price.</div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <Ledger
            title="SaaS invoices"
            rows={portal.invoices.map((invoice) => ({
              id: invoice.id,
              primary: invoice.invoiceNumber,
              secondary: new Date(invoice.createdAt).toLocaleDateString(),
              amount: money(invoice.total, invoice.currency),
              status: invoice.status,
            }))}
          />
          <Ledger
            title="Receipts"
            rows={portal.receipts.map((receipt) => ({
              id: receipt.id,
              primary: receipt.receiptNumber,
              secondary: new Date(receipt.paidAt).toLocaleDateString(),
              amount: money(receipt.amount, receipt.currency),
              status: 'PAID',
            }))}
          />
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className="mt-3 truncate text-xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-zinc-600">{detail}</div>
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

function Ledger({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    id: string;
    primary: string;
    secondary: string;
    amount: string;
    status: string;
  }>;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1017]">
      <div className="border-b border-white/10 px-5 py-4 font-semibold">{title}</div>
      <div className="divide-y divide-white/[0.06]">
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[1fr_auto] gap-3 px-5 py-4">
            <div>
              <div className="text-sm font-medium">{row.primary}</div>
              <div className="mt-1 text-xs text-zinc-600">{row.secondary} · {row.status}</div>
            </div>
            <div className="text-sm text-zinc-300">{row.amount}</div>
          </div>
        ))}
        {!rows.length ? <div className="px-5 py-10 text-center text-sm text-zinc-600">No records yet.</div> : null}
      </div>
    </section>
  );
}
