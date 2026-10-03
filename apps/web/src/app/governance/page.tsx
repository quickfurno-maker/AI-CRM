'use client';

import { FormEvent, useEffect, useState } from 'react';
import { EmptyState, WorkspaceLoading } from '@/components/workspace-states';

type Policy = {
  id: string;
  auditRetentionDays: number;
  notificationRetentionDays: number;
  supportRetentionDays: number;
  aiTraceRetentionDays: number;
  deletionGraceDays: number;
  legalHold: boolean;
};

type RequestRow = {
  id: string;
  requestType: 'EXPORT' | 'ERASURE';
  status: string;
  reason?: string | null;
  scheduledAt?: string | null;
  manifest?: Record<string, unknown> | null;
  createdAt: string;
};

export default function GovernancePage() {
  const [policy, setPolicy] = useState<Policy>();
  const [requests, setRequests] = useState<RequestRow[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    const [policyResponse, requestResponse] = await Promise.all([
      fetch('/api/platform/governance/policy', { cache: 'no-store' }),
      fetch('/api/platform/governance/requests', { cache: 'no-store' }),
    ]);
    if (!policyResponse.ok) throw new Error(await policyResponse.text());
    if (!requestResponse.ok) throw new Error(await requestResponse.text());
    setPolicy((await policyResponse.json()) as Policy);
    setRequests((await requestResponse.json()) as RequestRow[]);
  }

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      void load().catch((reason: Error) =>
        setError(reason.message),
      );
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, []);

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policy) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch('/api/platform/governance/policy', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          auditRetentionDays: Number(form.get('auditRetentionDays')),
          notificationRetentionDays: Number(form.get('notificationRetentionDays')),
          supportRetentionDays: Number(form.get('supportRetentionDays')),
          aiTraceRetentionDays: Number(form.get('aiTraceRetentionDays')),
          deletionGraceDays: Number(form.get('deletionGraceDays')),
          legalHold: form.get('legalHold') === 'on',
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save governance policy.');
    } finally {
      setBusy(false);
    }
  }

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch('/api/platform/governance/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestType: form.get('requestType'),
          reason: String(form.get('reason') ?? '') || undefined,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      event.currentTarget.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create governance request.');
    } finally {
      setBusy(false);
    }
  }

  async function exportAudit() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/audit/export?limit=5000', { cache: 'no-store' });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = 'business-os-audit-evidence.json';
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to export audit evidence.');
    } finally {
      setBusy(false);
    }
  }

  if (error && (!policy || !requests)) {
    return (
      <main className="route-state bg-[#07090d] text-zinc-100">
        <div className="route-state-card" role="alert">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-red-300">
            Data Governance
          </div>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">
            This workspace could not be loaded.
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            {error}
          </p>
        </div>
      </main>
    );
  }

  if (!policy || !requests) return <WorkspaceLoading label="Data Governance" />;

  return (
    <main className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7 lg:px-9">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">Data governance</div>
            <h1 className="mt-2">Retention, evidence and controlled data requests.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Configure retention policy, legal hold, export requests and erasure review without bypassing the governed workflow.
            </p>
          </div>
          <button disabled={busy} onClick={() => void exportAudit()} className="h-10 rounded-xl border border-white/10 px-4 text-xs font-medium text-zinc-300 hover:bg-white/[0.04]">
            Export audit evidence
          </button>
        </div>

        {error ? <div role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

        <div className="mt-7 grid gap-5 xl:grid-cols-[1fr_.8fr]">
          <form onSubmit={savePolicy} className="rounded-2xl border border-white/[0.07] bg-[#0d1017] p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">Retention policy</div>
                <div className="mt-1 text-xs text-zinc-600">Applied by the background governance worker.</div>
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input type="checkbox" name="legalHold" defaultChecked={policy.legalHold} />
                Legal hold
              </label>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ['auditRetentionDays','Audit logs',30,3650],
                ['notificationRetentionDays','Notifications',30,3650],
                ['supportRetentionDays','Support tickets',90,3650],
                ['aiTraceRetentionDays','AI traces',30,3650],
                ['deletionGraceDays','Erasure grace',7,180],
              ].map(([name,label,min,max]) => (
                <label key={String(name)} className="grid gap-1.5 text-xs text-zinc-500">
                  {String(label)} · days
                  <input
                    type="number"
                    name={String(name)}
                    min={Number(min)}
                    max={Number(max)}
                    defaultValue={policy[name as keyof Policy] as number}
                    required
                    className="h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-zinc-200"
                  />
                </label>
              ))}
            </div>
            <button disabled={busy} className="mt-5 h-10 rounded-xl bg-white px-4 text-xs font-semibold text-zinc-950">
              Save governance policy
            </button>
          </form>

          <form onSubmit={createRequest} className="rounded-2xl border border-white/[0.07] bg-[#0d1017] p-5">
            <div className="text-sm font-semibold">New governed request</div>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              Export produces a governed tenant manifest. Erasure requires provider review and respects legal hold plus the configured grace period.
            </p>
            <label className="mt-5 grid gap-1.5 text-xs text-zinc-500">
              Request type
              <select name="requestType" defaultValue="EXPORT" className="h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3">
                <option value="EXPORT">EXPORT</option>
                <option value="ERASURE" disabled={policy.legalHold}>ERASURE</option>
              </select>
            </label>
            <label className="mt-3 grid gap-1.5 text-xs text-zinc-500">
              Reason
              <textarea name="reason" rows={4} maxLength={2000} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-zinc-200" placeholder="Optional business or compliance context." />
            </label>
            <button disabled={busy} className="mt-4 h-10 rounded-xl border border-white/10 px-4 text-xs font-semibold text-zinc-200 hover:bg-white/[0.04]">
              Submit for review
            </button>
          </form>
        </div>

        <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d1017]">
          <div className="border-b border-white/[0.06] px-5 py-4 text-sm font-semibold">Governance requests</div>
          {!requests.length ? (
            <EmptyState title="No governance requests" description="Export and erasure requests will appear here with their governed review state." />
          ) : (
            <div className="divide-y divide-white/[0.055]">
              {requests.map((request) => (
                <div key={request.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[140px_1fr_auto] sm:items-center">
                  <div>
                    <div className="text-xs font-semibold text-zinc-300">{request.requestType}</div>
                    <div className="mt-1 text-[10px] text-zinc-600">{new Date(request.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">{request.reason || 'No additional reason supplied.'}</div>
                    {request.scheduledAt ? <div className="mt-1 text-[10px] text-amber-300/70">Scheduled after grace: {new Date(request.scheduledAt).toLocaleString()}</div> : null}
                  </div>
                  <div className="text-[10px] font-medium text-violet-300">{request.status.replaceAll('_',' ')}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
