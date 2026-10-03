'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { EmptyState, WorkspaceLoading } from '@/components/workspace-states';

type Ticket = {
  id: string;
  ticketNumber: string;
  category: string;
  priority: string;
  status: string;
  subject: string;
  description: string;
  lastActivityAt: string;
  createdAt: string;
};

type Comment = {
  id: string;
  authorType: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
};

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>();
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<{ ticket: Ticket; comments: Comment[] }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadTickets() {
    setError('');
    const response = await fetch('/api/platform/support/tickets', {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(await response.text());
    const rows = (await response.json()) as Ticket[];
    setTickets(rows);
    setSelectedId((current) => current ?? rows[0]?.id);
  }

  async function loadDetail(id: string) {
    const response = await fetch(
      '/api/platform/support/tickets/' + id,
      { cache: 'no-store' },
    );
    if (!response.ok) throw new Error(await response.text());
    setDetail(
      (await response.json()) as {
        ticket: Ticket;
        comments: Comment[];
      },
    );
  }

  useEffect(() => {
    void loadTickets().catch((reason: Error) =>
      setError(reason.message),
    );
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(undefined);
      return;
    }
    void loadDetail(selectedId).catch((reason: Error) =>
      setError(reason.message),
    );
  }, [selectedId]);

  const openCount = useMemo(
    () =>
      (tickets ?? []).filter(
        (ticket) =>
          !['RESOLVED', 'CLOSED'].includes(ticket.status),
      ).length,
    [tickets],
  );

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch('/api/platform/support/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          category: form.get('category'),
          priority: form.get('priority'),
          subject: form.get('subject'),
          description: form.get('description'),
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const ticket = (await response.json()) as Ticket;
      event.currentTarget.reset();
      await loadTickets();
      setSelectedId(ticket.id);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to create ticket.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      const body = String(form.get('body') ?? '').trim();
      if (!body) return;
      const response = await fetch(
        '/api/platform/support/tickets/' +
          selectedId +
          '/comments',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      event.currentTarget.reset();
      await Promise.all([loadDetail(selectedId), loadTickets()]);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to send reply.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!tickets) return <WorkspaceLoading label="Support Center" />;

  return (
    <main className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto max-w-[1650px] px-4 py-6 sm:px-7 lg:px-9">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">
              Support Center
            </div>
            <h1 className="mt-2">Get help without losing business context.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Tickets stay tenant-bound and can be linked to product, billing,
              WhatsApp, AI, automation or security work.
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">Open tickets</div>
            <div className="mt-1 text-xl font-semibold">{openCount}</div>
          </div>
        </div>

        {error ? (
          <div role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-7 grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
          <section className="grid gap-5">
            <form onSubmit={createTicket} className="rounded-2xl border border-white/[0.07] bg-[#0d1017] p-5">
              <div className="text-sm font-semibold">New support request</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs text-zinc-500">
                  Category
                  <select name="category" defaultValue="PRODUCT" className="h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3">
                    {['PRODUCT','BILLING','WHATSAPP','AI','AUTOMATION','SECURITY','OTHER'].map((value)=><option key={value}>{value}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs text-zinc-500">
                  Priority
                  <select name="priority" defaultValue="NORMAL" className="h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3">
                    {['LOW','NORMAL','HIGH','URGENT'].map((value)=><option key={value}>{value}</option>)}
                  </select>
                </label>
              </div>
              <label className="mt-3 grid gap-1.5 text-xs text-zinc-500">
                Subject
                <input name="subject" minLength={4} maxLength={240} required className="h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-zinc-200" placeholder="What needs attention?" />
              </label>
              <label className="mt-3 grid gap-1.5 text-xs text-zinc-500">
                Details
                <textarea name="description" minLength={10} maxLength={8000} required rows={5} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-zinc-200" placeholder="Describe the issue, expected behavior and business impact." />
              </label>
              <button disabled={busy} className="mt-4 h-10 rounded-xl bg-white px-4 text-xs font-semibold text-zinc-950">
                Create ticket
              </button>
            </form>

            <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d1017]">
              <div className="border-b border-white/[0.06] px-4 py-3 text-sm font-semibold">Your tickets</div>
              {!tickets.length ? (
                <EmptyState title="No support tickets" description="New support requests will appear here with their current provider status." />
              ) : (
                <div className="divide-y divide-white/[0.055]">
                  {tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => setSelectedId(ticket.id)}
                      className={'block w-full px-4 py-3 text-left transition hover:bg-white/[0.025] ' + (selectedId === ticket.id ? 'bg-violet-400/[0.06]' : '')}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-zinc-300">{ticket.ticketNumber}</span>
                        <span className="text-[9px] text-zinc-600">{ticket.status.replaceAll('_',' ')}</span>
                      </div>
                      <div className="mt-1 truncate text-xs text-zinc-500">{ticket.subject}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="min-h-[560px] rounded-2xl border border-white/[0.07] bg-[#0d1017] p-5">
            {!detail ? (
              <EmptyState title="Choose a support ticket" description="Review the conversation, status and provider replies here." />
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] pb-5">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                      {detail.ticket.ticketNumber} · {detail.ticket.category}
                    </div>
                    <h2 className="mt-2 text-xl font-semibold tracking-tight">{detail.ticket.subject}</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">{detail.ticket.description}</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[10px] text-zinc-400">
                    {detail.ticket.status.replaceAll('_',' ')}
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  {detail.comments.length ? detail.comments.map((comment) => (
                    <div key={comment.id} className={'max-w-[88%] rounded-2xl border p-4 ' + (comment.authorType === 'PROVIDER' ? 'border-violet-400/15 bg-violet-400/[0.05]' : 'ml-auto border-white/[0.07] bg-white/[0.025]')}>
                      <div className="text-[9px] uppercase tracking-[0.13em] text-zinc-600">{comment.authorType}</div>
                      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{comment.body}</div>
                    </div>
                  )) : (
                    <div className="text-xs text-zinc-600">No replies yet.</div>
                  )}
                </div>

                {!['CLOSED'].includes(detail.ticket.status) ? (
                  <form onSubmit={addComment} className="mt-6 flex gap-2 border-t border-white/[0.06] pt-5">
                    <input name="body" required maxLength={8000} autoComplete="off" aria-label="Reply to support ticket" placeholder="Reply to support…" className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm text-zinc-200" />
                    <button disabled={busy} className="h-11 rounded-xl bg-white px-4 text-xs font-semibold text-zinc-950">Send</button>
                  </form>
                ) : null}
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
