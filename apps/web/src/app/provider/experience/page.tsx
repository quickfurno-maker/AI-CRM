'use client';

import { FormEvent, useEffect, useState } from 'react';
import { EmptyState, WorkspaceLoading } from '@/components/workspace-states';

type Ticket = {
  id: string;
  ticketNumber: string;
  organizationId: string;
  priority: string;
  status: string;
  subject: string;
  category: string;
  lastActivityAt: string;
};

type Governance = {
  id: string;
  organizationId: string;
  requestType: string;
  status: string;
  reason?: string | null;
  createdAt: string;
};

export default function ProviderExperiencePage() {
  const [tickets, setTickets] = useState<Ticket[]>();
  const [requests, setRequests] = useState<Governance[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [ticketResponse, governanceResponse] = await Promise.all([
      fetch('/api/platform-admin/experience/support/tickets', { cache: 'no-store' }),
      fetch('/api/platform-admin/experience/governance/requests', { cache: 'no-store' }),
    ]);
    if (!ticketResponse.ok) throw new Error(await ticketResponse.text());
    if (!governanceResponse.ok) throw new Error(await governanceResponse.text());
    setTickets((await ticketResponse.json()) as Ticket[]);
    setRequests((await governanceResponse.json()) as Governance[]);
  }

  useEffect(() => {
    void load().catch((reason: Error) => setError(reason.message));
  }, []);

  async function updateTicket(id: string, status: string) {
    setBusy(true);
    try {
      const response = await fetch('/api/platform-admin/experience/support/tickets/' + id, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(await response.text());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update ticket.');
    } finally {
      setBusy(false);
    }
  }

  async function review(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch('/api/platform-admin/experience/governance/requests/' + id + '/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decision: form.get('decision'),
          note: String(form.get('note') ?? '') || undefined,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to review governance request.');
    } finally {
      setBusy(false);
    }
  }

  if (!tickets || !requests) return <WorkspaceLoading label="Provider Experience" />;

  return (
    <main className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto max-w-[1700px] px-4 py-6 sm:px-7 lg:px-9">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">Provider operations</div>
          <h1 className="mt-2">Support & governance review.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Review customer support and high-impact data requests without crossing tenant ownership boundaries.
          </p>
        </div>

        {error ? <div role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

        <div className="mt-7 grid gap-6 2xl:grid-cols-2">
          <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d1017]">
            <div className="border-b border-white/[0.06] px-5 py-4 text-sm font-semibold">Support queue</div>
            {!tickets.length ? <EmptyState title="Support queue is clear" description="Tenant support requests will appear here." /> : (
              <div className="divide-y divide-white/[0.055]">
                {tickets.slice(0,100).map((ticket) => (
                  <div key={ticket.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-zinc-300">{ticket.ticketNumber} · {ticket.priority}</div>
                        <div className="mt-1 text-sm text-zinc-400">{ticket.subject}</div>
                        <div className="mt-1 text-[10px] text-zinc-700">{ticket.category} · {ticket.organizationId}</div>
                      </div>
                      <select
                        disabled={busy}
                        value={ticket.status}
                        onChange={(event) => void updateTicket(ticket.id, event.target.value)}
                        className="h-9 rounded-xl border border-white/10 bg-white/[0.03] px-2 text-[10px] text-zinc-300"
                      >
                        {['OPEN','WAITING_CUSTOMER','WAITING_PROVIDER','RESOLVED','CLOSED'].map((value)=><option key={value}>{value}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d1017]">
            <div className="border-b border-white/[0.06] px-5 py-4 text-sm font-semibold">Governance review queue</div>
            {!requests.length ? <EmptyState title="No pending governance work" description="Tenant export and erasure requests appear here for provider review." /> : (
              <div className="divide-y divide-white/[0.055]">
                {requests.slice(0,100).map((request) => (
                  <div key={request.id} className="px-5 py-4">
                    <div className="text-xs font-semibold text-zinc-300">{request.requestType} · {request.status.replaceAll('_',' ')}</div>
                    <div className="mt-1 text-[10px] text-zinc-700">{request.organizationId}</div>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">{request.reason || 'No reason supplied.'}</p>
                    {request.status === 'PENDING_REVIEW' ? (
                      <form onSubmit={(event)=>void review(event, request.id)} className="mt-3 flex flex-wrap gap-2">
                        <select name="decision" defaultValue="APPROVE" className="h-9 rounded-xl border border-white/10 bg-white/[0.03] px-2 text-[10px]">
                          <option value="APPROVE">APPROVE</option>
                          <option value="REJECT">REJECT</option>
                        </select>
                        <input name="note" maxLength={2000} placeholder="Review note" className="h-9 min-w-[180px] flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs" />
                        <button disabled={busy} className="h-9 rounded-xl bg-white px-3 text-[10px] font-semibold text-zinc-950">Submit review</button>
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
