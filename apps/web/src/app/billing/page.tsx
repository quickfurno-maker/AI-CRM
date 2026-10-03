'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { WorkspaceLoading } from '@/components/workspace-states';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type Contact = { id: string; displayName: string; email?: string | null; phone?: string | null };
type BillingDashboard = {
  currency: string;
  invoiced: string;
  collected: string;
  outstanding: string;
  overdue: string;
  invoiceCount: number;
};
type Settings = {
  legalName: string;
  taxId?: string | null;
  currency: string;
  quotePrefix: string;
  invoicePrefix: string;
  creditNotePrefix: string;
  receiptPrefix: string;
  defaultPaymentTermsDays: number;
};
type Quote = {
  id: string;
  contactId?: string | null;
  quoteNumber?: string | null;
  status: string;
  currency: string;
  total: string;
  validUntil?: string | null;
  createdAt: string;
};
type Invoice = {
  id: string;
  contactId?: string | null;
  invoiceNumber?: string | null;
  status: string;
  currency: string;
  total: string;
  paidAmount: string;
  creditedAmount: string;
  balanceDue: string;
  dueDate?: string | null;
  createdAt: string;
};

const field =
  'h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-emerald-400/50';

async function api<T>(namespace: 'business-billing' | 'crm', path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/' + namespace + '/' + path, {
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
    const message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    throw new Error(message ?? 'Request failed.');
  }
  return body;
}

export default function BillingPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<BillingDashboard>();
  const [settings, setSettings] = useState<Settings>();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tab, setTab] = useState<'quotes' | 'invoices' | 'settings'>('quotes');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});
  const [creditAmounts, setCreditAmounts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [d, s, c, q, i] = await Promise.all([
        api<BillingDashboard>('business-billing', 'dashboard'),
        api<Settings>('business-billing', 'settings'),
        api<Contact[]>('crm', 'contacts?limit=100'),
        api<Quote[]>('business-billing', 'quotes?limit=100'),
        api<Invoice[]>('business-billing', 'invoices?limit=100'),
      ]);
      setDashboard(d);
      setSettings(s);
      setContacts(c);
      setQuotes(q);
      setInvoices(i);
      setError('');
    } catch (reason) {
      if (reason instanceof Error && reason.message === 'AUTH') {
        router.replace('/login');
        return;
      }
      setError(reason instanceof Error ? reason.message : 'Unable to load billing.');
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const contactMap = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact.displayName])),
    [contacts],
  );

  async function act(path: string, body?: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      await api('business-billing', path, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function createQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      await api('business-billing', 'quotes', {
        method: 'POST',
        body: JSON.stringify({
          contactId: data.get('contactId'),
          validUntil: data.get('validUntil') || undefined,
          notes: data.get('notes') || undefined,
          items: [
            {
              description: data.get('description'),
              quantity: data.get('quantity'),
              unitPrice: data.get('unitPrice'),
              discountAmount: data.get('discountAmount') || '0',
              taxRatePercent: data.get('taxRatePercent') || '0',
            },
          ],
        }),
      });
      form.reset();
      await load();
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create quote.');
    } finally {
      setBusy(false);
    }
  }

  async function convertQuote(quoteId: string) {
    setBusy(true);
    try {
      const result = await api<{ invoice: Invoice }>('business-billing', 'invoices', {
        method: 'POST',
        body: JSON.stringify({ quoteId }),
      });
      await api('business-billing', 'invoices/' + result.invoice.id + '/issue', {
        method: 'POST',
      });
      await load();
      setTab('invoices');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to convert quote.');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api('business-billing', 'settings', {
        method: 'PUT',
        body: JSON.stringify({
          legalName: form.get('legalName'),
          taxId: form.get('taxId') || undefined,
          currency: form.get('currency'),
          quotePrefix: form.get('quotePrefix'),
          invoicePrefix: form.get('invoicePrefix'),
          creditNotePrefix: form.get('creditNotePrefix'),
          receiptPrefix: form.get('receiptPrefix'),
          defaultPaymentTermsDays: Number(form.get('defaultPaymentTermsDays')),
        }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save settings.');
    } finally {
      setBusy(false);
    }
  }

  if ((!dashboard || !settings) && !error) {
    return <WorkspaceLoading label="Business Billing" />;
  }

  return (
    <main className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto grid min-h-screen max-w-[1800px] lg:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-white/10 bg-[#0b0e14] p-5 lg:block">
          <div className="mb-8 px-2">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
              Business OS
            </div>
            <div className="mt-2 text-lg font-semibold">Business Billing</div>
            <div className="mt-1 text-xs text-zinc-600">Customer finance</div>
          </div>
          <nav className="space-y-1 text-sm">
            <Link href="/dashboard" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              Command Center
            </Link>
            <Link href="/crm" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              CRM
            </Link>
            <div className="rounded-xl bg-emerald-400/10 px-3 py-2.5 text-emerald-200">
              Billing
            </div>
            <Link href="/analytics" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              Analytics
            </Link>
            <Link href="/automations" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              Automations
            </Link>
          </nav>
        </aside>

        <section className="min-w-0 p-4 sm:p-7 lg:p-9">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Business Billing · not SaaS subscription billing
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Quotes, invoices & collections
              </h1>
              <p className="mt-2 text-sm text-zinc-500">
                Immutable issued documents, server-calculated taxes, receipts,
                credits and outstanding balances.
              </p>
            </div>
            <button onClick={() => void load()} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300">
              Refresh
            </button>
          </header>

          {error ? (
            <div role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Invoiced" value={formatMoney(dashboard?.invoiced, dashboard?.currency)} />
            <Metric label="Collected" value={formatMoney(dashboard?.collected, dashboard?.currency)} />
            <Metric label="Outstanding" value={formatMoney(dashboard?.outstanding, dashboard?.currency)} />
            <Metric label="Overdue" value={formatMoney(dashboard?.overdue, dashboard?.currency)} />
          </div>

          <div className="mt-6 flex gap-1 rounded-xl border border-white/10 bg-white/[0.025] p-1">
            {(['quotes', 'invoices', 'settings'] as const).map((item) => (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={
                  'rounded-lg px-4 py-2 text-sm capitalize ' +
                  (tab === item ? 'bg-emerald-400/10 text-emerald-200' : 'text-zinc-500')
                }
              >
                {item}
              </button>
            ))}
          </div>

          {tab === 'quotes' ? (
            <div className="mt-6 grid gap-5 2xl:grid-cols-[400px_1fr]">
              <form onSubmit={createQuote} className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                <h2 className="font-semibold">New quote</h2>
                <div className="mt-4 grid gap-3">
                  <select className={field} name="contactId" defaultValue="" required>
                    <option value="" disabled>Select CRM contact</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>{contact.displayName}</option>
                    ))}
                  </select>
                  <input className={field} name="description" placeholder="Line item description" required />
                  <div className="grid grid-cols-2 gap-3">
                    <input className={field} name="quantity" defaultValue="1" inputMode="decimal" required />
                    <input className={field} name="unitPrice" placeholder="Unit price" inputMode="decimal" required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input className={field} name="discountAmount" placeholder="Discount" inputMode="decimal" />
                    <input className={field} name="taxRatePercent" placeholder="Tax %" inputMode="decimal" />
                  </div>
                  <input className={field} name="validUntil" type="date" />
                  <textarea className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm outline-none" name="notes" rows={3} placeholder="Notes" />
                  <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60">
                    Create draft
                  </button>
                </div>
              </form>

              <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                <h2 className="font-semibold">Quotes</h2>
                <div className="mt-4 space-y-2">
                  {quotes.map((quote) => (
                    <article key={quote.id} className="rounded-xl border border-white/[0.07] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">
                            {quote.quoteNumber ?? 'Draft quote'} · {contactMap.get(quote.contactId ?? '') ?? 'Customer'}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {new Date(quote.createdAt).toLocaleDateString()} · {quote.status}
                          </div>
                        </div>
                        <div className="text-sm font-semibold">
                          {formatMoney(quote.total, quote.currency)}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {quote.status === 'DRAFT' ? (
                          <button disabled={busy} onClick={() => void act('quotes/' + quote.id + '/issue')} className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-zinc-950">
                            Issue quote
                          </button>
                        ) : null}
                        {quote.status === 'SENT' ? (
                          <>
                            <button disabled={busy} onClick={() => void act('quotes/' + quote.id + '/decision', { status: 'ACCEPTED' })} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-950">
                              Accept
                            </button>
                            <button disabled={busy} onClick={() => void act('quotes/' + quote.id + '/decision', { status: 'REJECTED' })} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400">
                              Reject
                            </button>
                          </>
                        ) : null}
                        {['SENT', 'ACCEPTED'].includes(quote.status) ? (
                          <button disabled={busy} onClick={() => void convertQuote(quote.id)} className="rounded-lg border border-emerald-400/20 px-3 py-1.5 text-xs text-emerald-300">
                            Convert + issue invoice
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {tab === 'invoices' ? (
            <section className="mt-6 rounded-2xl border border-white/10 bg-[#0d1017] p-5">
              <h2 className="font-semibold">Invoices & collections</h2>
              <div className="mt-4 space-y-3">
                {invoices.map((invoice) => (
                  <article key={invoice.id} className="rounded-xl border border-white/[0.07] p-4">
                    <div className="grid gap-3 lg:grid-cols-[1.4fr_.7fr_.7fr_.7fr]">
                      <div>
                        <div className="font-medium">
                          {invoice.invoiceNumber ?? 'Draft invoice'} · {contactMap.get(invoice.contactId ?? '') ?? 'Customer'}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {invoice.status}
                          {invoice.dueDate ? ' · due ' + new Date(invoice.dueDate).toLocaleDateString() : ''}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-zinc-600">Total</div>
                        <div className="mt-1 text-sm">{formatMoney(invoice.total, invoice.currency)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-zinc-600">Paid / credited</div>
                        <div className="mt-1 text-sm text-zinc-400">
                          {formatMoney(invoice.paidAmount, invoice.currency)} / {formatMoney(invoice.creditedAmount, invoice.currency)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-zinc-600">Balance</div>
                        <div className="mt-1 text-sm font-semibold text-emerald-300">
                          {formatMoney(invoice.balanceDue, invoice.currency)}
                        </div>
                      </div>
                    </div>

                    {invoice.status === 'DRAFT' ? (
                      <button disabled={busy} onClick={() => void act('invoices/' + invoice.id + '/issue')} className="mt-3 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-zinc-950">
                        Issue invoice
                      </button>
                    ) : null}

                    {['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status) ? (
                      <div className="mt-4 grid gap-3 border-t border-white/[0.06] pt-4 lg:grid-cols-2">
                        <div className="flex gap-2">
                          <input
                            className={field + ' min-w-0 flex-1'}
                            placeholder="Payment amount"
                            value={paymentAmounts[invoice.id] ?? ''}
                            onChange={(event) =>
                              setPaymentAmounts((current) => ({ ...current, [invoice.id]: event.target.value }))
                            }
                          />
                          <button
                            disabled={busy || !paymentAmounts[invoice.id]}
                            onClick={() =>
                              void act('invoices/' + invoice.id + '/payments', {
                                amount: paymentAmounts[invoice.id],
                                method: 'UPI',
                              })
                            }
                            className="rounded-xl bg-white px-3 text-xs font-semibold text-zinc-950 disabled:opacity-50"
                          >
                            Record payment
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                            className={field + ' min-w-0 flex-1'}
                            placeholder="Credit amount"
                            value={creditAmounts[invoice.id] ?? ''}
                            onChange={(event) =>
                              setCreditAmounts((current) => ({ ...current, [invoice.id]: event.target.value }))
                            }
                          />
                          <button
                            disabled={busy || !creditAmounts[invoice.id]}
                            onClick={() =>
                              void act('invoices/' + invoice.id + '/credit-notes', {
                                amount: creditAmounts[invoice.id],
                                reason: 'Commercial adjustment',
                              })
                            }
                            className="rounded-xl border border-white/10 px-3 text-xs text-zinc-300 disabled:opacity-50"
                          >
                            Issue credit
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {tab === 'settings' && settings ? (
            <form onSubmit={saveSettings} className="mt-6 max-w-3xl rounded-2xl border border-white/10 bg-[#0d1017] p-5">
              <h2 className="font-semibold">Billing identity & numbering</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input className={field} name="legalName" defaultValue={settings.legalName} placeholder="Legal business name" required />
                <input className={field} name="taxId" defaultValue={settings.taxId ?? ''} placeholder="Tax / GST ID" />
                <input className={field} name="currency" defaultValue={settings.currency} placeholder="INR" required />
                <input className={field} name="defaultPaymentTermsDays" type="number" min="0" max="365" defaultValue={settings.defaultPaymentTermsDays} />
                <input className={field} name="quotePrefix" defaultValue={settings.quotePrefix} />
                <input className={field} name="invoicePrefix" defaultValue={settings.invoicePrefix} />
                <input className={field} name="creditNotePrefix" defaultValue={settings.creditNotePrefix} />
                <input className={field} name="receiptPrefix" defaultValue={settings.receiptPrefix} />
                <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60 sm:col-span-2">
                  Save billing settings
                </button>
              </div>
            </form>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
    </article>
  );
}

function formatMoney(value?: string | number, currency = 'INR') {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}
