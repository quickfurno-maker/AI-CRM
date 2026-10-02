'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type Channel = {
  id: string;
  displayName?: string | null;
  displayAddress?: string | null;
  providerPhoneNumberId?: string | null;
  status: string;
};

type Agent = {
  id: string;
  name: string;
  role: string;
  status: string;
  defaultHandlingMode: string;
};

type BindingRow = {
  binding: {
    id: string;
    channelAccountId: string;
    agentId: string;
    operatorMemberId?: string | null;
    enabled: boolean;
    defaultHandlingMode: 'HUMAN' | 'AI' | 'AI_ASSIST';
    maxContextMessages: number;
    autoReplyEnabled: boolean;
    updatedAt: string;
  };
  channelName?: string | null;
  channelAddress?: string | null;
  channelStatus: string;
  agentName: string;
  agentStatus: string;
};

type Job = {
  id: string;
  conversationId: string;
  inboundMessageId: string;
  runId?: string | null;
  outboundMessageId?: string | null;
  status: string;
  attempts: number;
  lastError?: string | null;
  createdAt: string;
};

type Suggestion = {
  id: string;
  conversationId: string;
  runId: string;
  agentId: string;
  status: string;
  content: string;
  sentMessageId?: string | null;
  createdAt: string;
};

const field =
  'h-11 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-emerald-400/50';

async function call<T>(
  root: 'ai' | 'communication',
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch('/api/' + root + '/' + path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });

  const body = (await response.json().catch(() => ({}))) as T & {
    message?: string | string[];
  };

  if (!response.ok) {
    const message = Array.isArray(body.message)
      ? body.message.join(' ')
      : body.message;
    throw new Error(message ?? 'Request failed.');
  }

  return body;
}

export default function AiWhatsappPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [bindings, setBindings] = useState<BindingRow[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [channelRows, agentRows, bindingRows, jobRows, suggestionRows] =
        await Promise.all([
          call<Channel[]>('communication', 'channels'),
          call<Agent[]>('ai', 'agents'),
          call<BindingRow[]>('ai', 'whatsapp/bindings'),
          call<Job[]>('ai', 'whatsapp/jobs'),
          call<Suggestion[]>('ai', 'whatsapp/suggestions'),
        ]);

      setChannels(channelRows.filter((item) => item.status === 'CONNECTED'));
      setAgents(agentRows.filter((item) => item.status === 'ACTIVE'));
      setBindings(bindingRows);
      setJobs(jobRows);
      setSuggestions(suggestionRows);
      setError('');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to load AI WhatsApp settings.',
      );
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const metrics = useMemo(
    () => ({
      enabled: bindings.filter((item) => item.binding.enabled).length,
      actionRequired: jobs.filter(
        (item) => item.status === 'ACTION_REQUIRED',
      ).length,
      drafts: suggestions.filter((item) => item.status === 'DRAFT').length,
      completed: jobs.filter((item) => item.status === 'COMPLETED').length,
    }),
    [bindings, jobs, suggestions],
  );

  async function saveBinding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const channelAccountId = String(form.get('channelAccountId') ?? '');
    const agentId = String(form.get('agentId') ?? '');

    if (!channelAccountId || !agentId) return;

    setBusy(true);
    try {
      await call('ai', 'whatsapp/bindings', {
        method: 'PUT',
        body: JSON.stringify({
          channelAccountId,
          agentId,
          enabled: form.get('enabled') === 'on',
          defaultHandlingMode: form.get('defaultHandlingMode'),
          maxContextMessages: Number(form.get('maxContextMessages') ?? 20),
          autoReplyEnabled: form.get('autoReplyEnabled') === 'on',
        }),
      });
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to save AI WhatsApp binding.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendSuggestion(id: string) {
    setBusy(true);
    try {
      await call('ai', 'whatsapp/suggestions/' + id + '/send', {
        method: 'POST',
      });
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to send AI suggestion.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto max-w-[1650px] px-4 py-7 sm:px-7 lg:px-10">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
              AI WhatsApp Extension
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              AI Client Handler
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Bind a connected client-owned WhatsApp number to a governed AI
              agent. AI Assist drafts replies for humans; AI mode can reply
              automatically only inside platform and Meta policy.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/whatsapp"
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
            >
              Back to WhatsApp
            </Link>
            <button
              onClick={() => void load()}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
            >
              Refresh
            </button>
          </div>
        </header>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Enabled numbers" value={metrics.enabled} />
          <Metric label="Completed jobs" value={metrics.completed} />
          <Metric label="Draft replies" value={metrics.drafts} />
          <Metric label="Action required" value={metrics.actionRequired} />
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[430px_1fr]">
          <form
            onSubmit={saveBinding}
            className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5"
          >
            <h2 className="font-semibold">Configure AI handling</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              The paid AI WhatsApp entitlement must be enabled before a binding
              can be activated.
            </p>

            <div className="mt-5 grid gap-3">
              <label className="grid gap-1.5 text-xs text-zinc-500">
                WhatsApp number
                <select
                  name="channelAccountId"
                  required
                  className={field}
                  defaultValue=""
                >
                  <option value="">Select connected number</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.displayName ??
                        channel.displayAddress ??
                        channel.providerPhoneNumberId ??
                        channel.id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-xs text-zinc-500">
                Active AI agent
                <select
                  name="agentId"
                  required
                  className={field}
                  defaultValue=""
                >
                  <option value="">Select active agent</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} · {agent.role}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-xs text-zinc-500">
                Default handling mode
                <select
                  name="defaultHandlingMode"
                  defaultValue="AI_ASSIST"
                  className={field}
                >
                  <option value="AI_ASSIST">AI Assist</option>
                  <option value="AI">AI autonomous</option>
                  <option value="HUMAN">Human only</option>
                </select>
              </label>

              <label className="grid gap-1.5 text-xs text-zinc-500">
                Recent messages supplied as context
                <input
                  name="maxContextMessages"
                  type="number"
                  min={5}
                  max={100}
                  defaultValue={20}
                  className={field}
                />
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-sm">
                <input name="enabled" type="checkbox" />
                Enable AI client handling
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-sm">
                <input name="autoReplyEnabled" type="checkbox" className="mt-1" />
                <span>
                  Allow autonomous replies
                  <span className="mt-1 block text-xs leading-5 text-zinc-500">
                    Effective only when the conversation is in AI mode. The
                    backend still enforces the Meta service window, tenant
                    entitlement, channel state and idempotency.
                  </span>
                </span>
              </label>

              <button
                disabled={busy}
                className="h-11 rounded-xl bg-emerald-400 text-sm font-semibold text-zinc-950 disabled:opacity-60"
              >
                Save AI binding
              </button>
            </div>
          </form>

          <div className="space-y-5">
            <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Active bindings</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    One binding per WhatsApp phone number.
                  </p>
                </div>
                <Link
                  href="/ai-agents"
                  className="rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300"
                >
                  Manage agents
                </Link>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {bindings.map((row) => (
                  <article
                    key={row.binding.id}
                    className="rounded-xl border border-white/[0.07] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">
                          {row.channelName ?? row.channelAddress ?? 'WhatsApp'}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {row.agentName}
                        </div>
                      </div>
                      <span
                        className={
                          'rounded-full px-2.5 py-1 text-[11px] ' +
                          (row.binding.enabled
                            ? 'bg-emerald-400/15 text-emerald-300'
                            : 'bg-white/[0.05] text-zinc-500')
                        }
                      >
                        {row.binding.enabled ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                      <div>
                        Mode
                        <div className="mt-1 text-zinc-300">
                          {row.binding.defaultHandlingMode}
                        </div>
                      </div>
                      <div>
                        Auto reply
                        <div className="mt-1 text-zinc-300">
                          {row.binding.autoReplyEnabled ? 'ON' : 'OFF'}
                        </div>
                      </div>
                      <div>
                        Channel
                        <div className="mt-1 text-zinc-300">
                          {row.channelStatus}
                        </div>
                      </div>
                      <div>
                        Agent
                        <div className="mt-1 text-zinc-300">
                          {row.agentStatus}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
                {!bindings.length ? (
                  <div className="py-12 text-sm text-zinc-600">
                    No AI WhatsApp bindings configured yet.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
              <h2 className="font-semibold">AI Assist drafts</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Human-reviewed replies generated for conversations in AI Assist
                mode.
              </p>

              <div className="mt-4 space-y-3">
                {suggestions.slice(0, 30).map((suggestion) => (
                  <article
                    key={suggestion.id}
                    className="rounded-xl border border-white/[0.07] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-zinc-600">
                          {suggestion.status} ·{' '}
                          {new Date(suggestion.createdAt).toLocaleString()}
                        </div>
                        <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                          {suggestion.content}
                        </div>
                      </div>
                      {suggestion.status === 'DRAFT' ? (
                        <button
                          onClick={() => void sendSuggestion(suggestion.id)}
                          disabled={busy}
                          className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-zinc-950 disabled:opacity-60"
                        >
                          Send reply
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
                {!suggestions.length ? (
                  <div className="py-10 text-sm text-zinc-600">
                    No AI-assisted reply drafts yet.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
              <h2 className="font-semibold">Processing jobs</h2>
              <div className="mt-4 overflow-x-auto">
                <div className="min-w-[760px] overflow-hidden rounded-xl border border-white/[0.07]">
                  <div className="grid grid-cols-[1fr_.8fr_.7fr_1.8fr] gap-3 border-b border-white/[0.07] px-4 py-3 text-xs uppercase text-zinc-600">
                    <span>Created</span>
                    <span>Status</span>
                    <span>Attempts</span>
                    <span>Result / issue</span>
                  </div>
                  {jobs.slice(0, 50).map((job) => (
                    <div
                      key={job.id}
                      className="grid grid-cols-[1fr_.8fr_.7fr_1.8fr] gap-3 border-b border-white/[0.05] px-4 py-3 text-xs last:border-0"
                    >
                      <span className="text-zinc-500">
                        {new Date(job.createdAt).toLocaleString()}
                      </span>
                      <span className="text-zinc-300">{job.status}</span>
                      <span className="text-zinc-500">{job.attempts}</span>
                      <span className="truncate text-zinc-500">
                        {job.lastError ??
                          (job.outboundMessageId
                            ? 'Reply sent'
                            : job.runId
                              ? 'AI run completed'
                              : '—')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>

        <section className="mt-5 rounded-2xl border border-violet-400/15 bg-violet-400/[0.04] p-5">
          <h2 className="font-semibold">Runtime safety</h2>
          <div className="mt-3 grid gap-3 text-sm leading-6 text-zinc-500 md:grid-cols-2">
            <p>
              Inbound events arrive through the durable platform event stream
              and consumer group. Replayed events are idempotent per inbound
              message.
            </p>
            <p>
              Customer messages and CRM data are inserted into the AI context
              as untrusted data. OpenAI never receives database or Meta
              credentials.
            </p>
            <p>
              HUMAN mode stops autonomous handling. AI Assist creates a draft.
              AI mode can send only when the tenant explicitly enables auto
              reply.
            </p>
            <p>
              If delivery state is ambiguous or a governed action is waiting
              for approval, the job moves to ACTION_REQUIRED instead of blindly
              retrying.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
    </article>
  );
}
