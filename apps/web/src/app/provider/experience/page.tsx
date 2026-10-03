'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  EmptyState,
  WorkspaceLoading,
} from '@/components/workspace-states';

type Ticket = {
  id: string;
  ticketNumber: string;
  organizationId: string;
  priority: string;
  status: string;
  subject: string;
  description: string;
  category: string;
  lastActivityAt: string;
};

type Comment = {
  id: string;
  authorType: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
};

type Governance = {
  id: string;
  organizationId: string;
  requestType: string;
  status: string;
  reason?: string | null;
  manifest?: Record<string, unknown> | null;
  scheduledAt?: string | null;
  createdAt: string;
};

export default function ProviderExperiencePage() {
  const [tickets, setTickets] = useState<Ticket[]>();
  const [requests, setRequests] = useState<Governance[]>();
  const [selectedId, setSelectedId] = useState<string>();
  const [ticketDetail, setTicketDetail] = useState<{
    ticket: Ticket;
    comments: Comment[];
  }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [ticketResponse, governanceResponse] =
      await Promise.all([
        fetch(
          '/api/platform-admin/experience/support/tickets',
          { cache: 'no-store' },
        ),
        fetch(
          '/api/platform-admin/experience/governance/requests',
          { cache: 'no-store' },
        ),
      ]);
    if (!ticketResponse.ok)
      throw new Error(await ticketResponse.text());
    if (!governanceResponse.ok)
      throw new Error(await governanceResponse.text());
    const ticketRows = (await ticketResponse.json()) as Ticket[];
    setTickets(ticketRows);
    setRequests(
      (await governanceResponse.json()) as Governance[],
    );
    setSelectedId((current) => current ?? ticketRows[0]?.id);
  }

  async function loadTicket(id: string) {
    const response = await fetch(
      '/api/platform-admin/experience/support/tickets/' + id,
      { cache: 'no-store' },
    );
    if (!response.ok) throw new Error(await response.text());
    setTicketDetail(
      (await response.json()) as {
        ticket: Ticket;
        comments: Comment[];
      },
    );
  }

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      void load().catch((reason: Error) =>
        setError(reason.message),
      );
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const timer = globalThis.setTimeout(() => {
      void loadTicket(selectedId).catch((reason: Error) =>
        setError(reason.message),
      );
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [selectedId]);

  const pendingGovernance = useMemo(
    () =>
      (requests ?? []).filter(
        (request) => request.status === 'PENDING_REVIEW',
      ).length,
    [requests],
  );

  async function updateTicket(
    id: string,
    patch: { status?: string; priority?: string },
  ) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        '/api/platform-admin/experience/support/tickets/' + id,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      await Promise.all([load(), loadTicket(id)]);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to update ticket.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function reply(
    event: FormEvent<HTMLFormElement>,
    id: string,
  ) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      const body = String(form.get('body') ?? '').trim();
      const internal = form.get('internal') === 'on';
      if (!body) return;
      const response = await fetch(
        '/api/platform-admin/experience/support/tickets/' +
          id +
          '/comments?internal=' +
          String(internal),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      event.currentTarget.reset();
      await Promise.all([load(), loadTicket(id)]);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to send provider reply.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function review(
    event: FormEvent<HTMLFormElement>,
    id: string,
  ) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch(
        '/api/platform-admin/experience/governance/requests/' +
          id +
          '/review',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            decision: form.get('decision'),
            note:
              String(form.get('note') ?? '') || undefined,
          }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to review governance request.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!tickets || !requests)
    return <WorkspaceLoading label="Provider Experience" />;

  return (
    <main className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto max-w-[1750px] px-4 py-6 sm:px-7 lg:px-9">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">
              Provider operations
            </div>
            <h1 className="mt-2">
              Support & governance review.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Review customer support and high-impact data
              requests without crossing tenant ownership
              boundaries.
            </p>
          </div>
          <div className="flex gap-2">
            <Metric
              label="Support queue"
              value={String(
                tickets.filter(
                  (ticket) =>
                    !['RESOLVED', 'CLOSED'].includes(
                      ticket.status,
                    ),
                ).length,
              )}
            />
            <Metric
              label="Governance review"
              value={String(pendingGovernance)}
            />
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-7 grid gap-6 2xl:grid-cols-[1.15fr_.85fr]">
          <section className="grid min-h-[650px] gap-4 lg:grid-cols-[.72fr_1.28fr]">
            <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d1017]">
              <div className="border-b border-white/[0.06] px-4 py-3 text-sm font-semibold">
                Support queue
              </div>
              {!tickets.length ? (
                <EmptyState
                  title="Support queue is clear"
                  description="Tenant support requests will appear here."
                />
              ) : (
                <div className="max-h-[720px] divide-y divide-white/[0.055] overflow-y-auto">
                  {tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => setSelectedId(ticket.id)}
                      className={
                        'block w-full px-4 py-3 text-left transition hover:bg-white/[0.025] ' +
                        (selectedId === ticket.id
                          ? 'bg-violet-400/[0.06]'
                          : '')
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-zinc-300">
                          {ticket.ticketNumber}
                        </span>
                        <span className="text-[9px] text-zinc-600">
                          {ticket.priority}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs text-zinc-500">
                        {ticket.subject}
                      </div>
                      <div className="mt-1 text-[9px] text-zinc-700">
                        {ticket.status.replaceAll('_', ' ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-[#0d1017] p-5">
              {!ticketDetail ? (
                <EmptyState
                  title="Choose a support ticket"
                  description="Inspect tenant context, provider notes and customer-visible replies."
                />
              ) : (
                <>
                  <div className="border-b border-white/[0.06] pb-4">
                    <div className="text-[10px] uppercase tracking-[0.13em] text-violet-300">
                      {ticketDetail.ticket.ticketNumber} ·{' '}
                      {ticketDetail.ticket.category}
                    </div>
                    <h2 className="mt-2 text-lg font-semibold">
                      {ticketDetail.ticket.subject}
                    </h2>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      {ticketDetail.ticket.description}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <select
                        disabled={busy}
                        value={ticketDetail.ticket.status}
                        onChange={(event) =>
                          void updateTicket(
                            ticketDetail.ticket.id,
                            { status: event.target.value },
                          )
                        }
                        className="h-9 rounded-xl border border-white/10 bg-white/[0.03] px-2 text-[10px]"
                        aria-label="Support ticket status"
                      >
                        {[
                          'OPEN',
                          'WAITING_CUSTOMER',
                          'WAITING_PROVIDER',
                          'RESOLVED',
                          'CLOSED',
                        ].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                      <select
                        disabled={busy}
                        value={ticketDetail.ticket.priority}
                        onChange={(event) =>
                          void updateTicket(
                            ticketDetail.ticket.id,
                            { priority: event.target.value },
                          )
                        }
                        className="h-9 rounded-xl border border-white/10 bg-white/[0.03] px-2 text-[10px]"
                        aria-label="Support ticket priority"
                      >
                        {[
                          'LOW',
                          'NORMAL',
                          'HIGH',
                          'URGENT',
                        ].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto">
                    {ticketDetail.comments.length ? (
                      ticketDetail.comments.map((comment) => (
                        <div
                          key={comment.id}
                          className={
                            'rounded-xl border p-3 ' +
                            (comment.isInternal
                              ? 'border-amber-400/10 bg-amber-400/[0.035]'
                              : comment.authorType ===
                                  'PROVIDER'
                                ? 'border-violet-400/10 bg-violet-400/[0.035]'
                                : 'border-white/[0.06] bg-white/[0.018]')
                          }
                        >
                          <div className="text-[9px] uppercase tracking-[0.12em] text-zinc-600">
                            {comment.isInternal
                              ? 'INTERNAL NOTE'
                              : comment.authorType}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-zinc-300">
                            {comment.body}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-zinc-600">
                        No support conversation yet.
                      </div>
                    )}
                  </div>

                  {ticketDetail.ticket.status !== 'CLOSED' ? (
                    <form
                      onSubmit={(event) =>
                        void reply(
                          event,
                          ticketDetail.ticket.id,
                        )
                      }
                      className="mt-4 border-t border-white/[0.06] pt-4"
                    >
                      <textarea
                        name="body"
                        required
                        maxLength={8000}
                        rows={3}
                        placeholder="Provider reply or internal note…"
                        className="w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-zinc-200"
                      />
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-[10px] text-zinc-500">
                          <input
                            type="checkbox"
                            name="internal"
                          />
                          Internal note only
                        </label>
                        <button
                          disabled={busy}
                          className="h-9 rounded-xl bg-white px-3 text-[10px] font-semibold text-zinc-950"
                        >
                          Add message
                        </button>
                      </div>
                    </form>
                  ) : null}
                </>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d1017]">
            <div className="border-b border-white/[0.06] px-5 py-4 text-sm font-semibold">
              Governance review queue
            </div>
            {!requests.length ? (
              <EmptyState
                title="No pending governance work"
                description="Tenant export and erasure requests appear here for provider review."
              />
            ) : (
              <div className="max-h-[760px] divide-y divide-white/[0.055] overflow-y-auto">
                {requests.slice(0, 100).map((request) => (
                  <div key={request.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-zinc-300">
                          {request.requestType} ·{' '}
                          {request.status.replaceAll('_', ' ')}
                        </div>
                        <div className="mt-1 text-[10px] text-zinc-700">
                          {request.organizationId}
                        </div>
                      </div>
                      <div className="text-[9px] text-zinc-700">
                        {new Date(
                          request.createdAt,
                        ).toLocaleDateString()}
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      {request.reason || 'No reason supplied.'}
                    </p>
                    {request.manifest ? (
                      <pre className="mt-3 max-h-36 overflow-auto rounded-xl border border-white/[0.05] bg-black/20 p-3 text-[9px] leading-4 text-zinc-600">
                        {JSON.stringify(
                          request.manifest,
                          null,
                          2,
                        )}
                      </pre>
                    ) : null}
                    {request.scheduledAt ? (
                      <div className="mt-2 text-[10px] text-amber-300/70">
                        Scheduled after grace:{' '}
                        {new Date(
                          request.scheduledAt,
                        ).toLocaleString()}
                      </div>
                    ) : null}
                    {request.status === 'PENDING_REVIEW' ? (
                      <form
                        onSubmit={(event) =>
                          void review(event, request.id)
                        }
                        className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr_auto]"
                      >
                        <select
                          name="decision"
                          defaultValue="APPROVE"
                          className="h-9 rounded-xl border border-white/10 bg-white/[0.03] px-2 text-[10px]"
                        >
                          <option value="APPROVE">
                            APPROVE
                          </option>
                          <option value="REJECT">
                            REJECT
                          </option>
                        </select>
                        <input
                          name="note"
                          maxLength={2000}
                          placeholder="Review note"
                          className="h-9 min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs"
                        />
                        <button
                          disabled={busy}
                          className="h-9 rounded-xl bg-white px-3 text-[10px] font-semibold text-zinc-950"
                        >
                          Submit
                        </button>
                      </form>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-[116px] rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
      <div className="text-[9px] uppercase tracking-[0.12em] text-zinc-600">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">
        {value}
      </div>
    </div>
  );
}
