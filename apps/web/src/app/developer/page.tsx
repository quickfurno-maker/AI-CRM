'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  revokedAt?: string | null;
  lastUsedAt?: string | null;
};
type OauthClient = {
  id: string;
  name: string;
  clientId: string;
  clientSecretPrefix: string;
  scopes: string[];
  status: string;
  lastUsedAt?: string | null;
};
type Webhook = {
  id: string;
  name: string;
  url: string;
  events: string[];
  status: string;
  failureCount: number;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
};
type Delivery = {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  responseStatus?: number | null;
  lastError?: string | null;
  createdAt: string;
};
type Session = {
  capabilities: {
    entitlements: Array<{ key: string; enabled: boolean }>;
  };
};

const field =
  'h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-indigo-400/50';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/developer/' + path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  const body = (await response.json()) as T & { message?: string | string[] };
  if (!response.ok) {
    const message = Array.isArray(body.message)
      ? body.message.join(' ')
      : body.message;
    throw new Error(message ?? 'Request failed.');
  }
  return body;
}

export default function DeveloperPage() {
  const [enabled, setEnabled] = useState<boolean>();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [clients, setClients] = useState<OauthClient[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [revealed, setRevealed] = useState<{ label: string; secret: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const sessionResponse = await fetch('/api/session', { cache: 'no-store' });
      if (!sessionResponse.ok) throw new Error('Unable to load session.');
      const session = (await sessionResponse.json()) as Session;
      const hasApi =
        session.capabilities.entitlements.find((item) => item.key === 'core.api')
          ?.enabled ?? false;
      setEnabled(hasApi);
      if (!hasApi) return;

      const [keys, oauth, hooks, hookDeliveries] = await Promise.all([
        api<ApiKey[]>('api-keys'),
        api<OauthClient[]>('oauth-clients'),
        api<Webhook[]>('webhooks'),
        api<Delivery[]>('webhook-deliveries?limit=50'),
      ]);
      setApiKeys(keys);
      setClients(oauth);
      setWebhooks(hooks);
      setDeliveries(hookDeliveries);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load developer console.');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    path: string,
    body: (form: FormData) => Record<string, unknown>,
    reveal: (value: Record<string, unknown>) => { label: string; secret: string },
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError('');
    try {
      const result = await api<Record<string, unknown>>(path, {
        method: 'POST',
        body: JSON.stringify(body(new FormData(formElement))),
      });
      setRevealed(reveal(result));
      formElement.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create credential.');
    } finally {
      setBusy(false);
    }
  }

  async function action(path: string) {
    setBusy(true);
    setError('');
    try {
      const result = await api<Record<string, unknown>>(path, { method: 'POST' });
      if (typeof result.signingSecret === 'string') {
        setRevealed({ label: 'New webhook signing secret', secret: result.signingSecret });
      }
      if (typeof result.clientSecret === 'string') {
        setRevealed({ label: 'New OAuth client secret', secret: result.clientSecret });
      }
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  if (enabled === undefined) {
    return <main className="grid min-h-screen place-items-center bg-[#07090d] text-sm text-zinc-500">Loading Developer Platform…</main>;
  }

  if (!enabled) {
    return (
      <main className="min-h-screen bg-[#07090d] p-6 text-zinc-100">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-[#0d1017] p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300">Business OS · Developer Platform</div>
          <h1 className="mt-3 text-3xl font-semibold">API access is not enabled</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-500">
            Your provider must enable the <code className="text-zinc-300">core.api</code> add-on before API keys, OAuth clients and outbound webhooks can be used.
          </p>
          <Link href="/dashboard" className="mt-6 inline-flex rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300">Back to Command Center</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07090d] p-4 text-zinc-100 sm:p-7 lg:p-10">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300">Business OS · Developer Platform</div>
            <h1 className="mt-2 text-3xl font-semibold">Developer Console</h1>
            <p className="mt-2 text-sm text-zinc-500">Scoped API credentials, OAuth client credentials and signed outbound webhooks.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/marketplace" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300">Marketplace</Link>
            <Link href="/dashboard" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300">Command Center</Link>
          </div>
        </header>

        {error ? <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
        {revealed ? (
          <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] p-4">
            <div className="text-sm font-medium text-amber-200">{revealed.label}</div>
            <div className="mt-2 break-all rounded-lg bg-black/30 p-3 font-mono text-xs text-zinc-200">{revealed.secret}</div>
            <div className="mt-2 text-xs text-amber-200/70">Copy it now. It will not be shown again.</div>
          </div>
        ) : null}

        <div className="mt-6 grid gap-5 xl:grid-cols-3">
          <form
            className="rounded-2xl border border-white/10 bg-[#0d1017] p-5"
            onSubmit={(event) =>
              void submit(
                event,
                'api-keys',
                (form) => ({
                  name: form.get('name'),
                  scopes: split(form.get('scopes')),
                }),
                (value) => ({ label: 'API key', secret: String(value.secret) }),
              )
            }
          >
            <h2 className="font-semibold">Create API key</h2>
            <div className="mt-4 grid gap-3">
              <input className={field} name="name" placeholder="Integration name" required />
              <input className={field} name="scopes" placeholder="crm.contact.read, crm.lead.read" required />
              <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-50">Create key</button>
            </div>
          </form>

          <form
            className="rounded-2xl border border-white/10 bg-[#0d1017] p-5"
            onSubmit={(event) =>
              void submit(
                event,
                'oauth-clients',
                (form) => ({
                  name: form.get('name'),
                  scopes: split(form.get('scopes')),
                }),
                (value) => ({
                  label: 'OAuth client secret · ' + String(value.clientId),
                  secret: String(value.clientSecret),
                }),
              )
            }
          >
            <h2 className="font-semibold">Create OAuth client</h2>
            <div className="mt-4 grid gap-3">
              <input className={field} name="name" placeholder="Server integration" required />
              <input className={field} name="scopes" placeholder="crm.contact.read" required />
              <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-50">Create client</button>
            </div>
          </form>

          <form
            className="rounded-2xl border border-white/10 bg-[#0d1017] p-5"
            onSubmit={(event) =>
              void submit(
                event,
                'webhooks',
                (form) => ({
                  name: form.get('name'),
                  url: form.get('url'),
                  events: split(form.get('events')),
                }),
                (value) => ({
                  label: 'Webhook signing secret',
                  secret: String(value.signingSecret),
                }),
              )
            }
          >
            <h2 className="font-semibold">Add webhook</h2>
            <div className="mt-4 grid gap-3">
              <input className={field} name="name" placeholder="CRM events" required />
              <input className={field} name="url" type="url" placeholder="https://example.com/webhook" required />
              <input className={field} name="events" placeholder="crm.lead.created.v1" required />
              <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-50">Add webhook</button>
            </div>
          </form>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <Panel title="API keys">
            {apiKeys.map((key) => (
              <Row key={key.id} title={key.name} detail={key.keyPrefix + '… · ' + key.scopes.join(', ')}>
                <button disabled={busy || Boolean(key.revokedAt)} onClick={() => void action('api-keys/' + key.id + '/revoke')} className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs text-red-300 disabled:opacity-30">
                  {key.revokedAt ? 'Revoked' : 'Revoke'}
                </button>
              </Row>
            ))}
          </Panel>

          <Panel title="OAuth clients">
            {clients.map((client) => (
              <Row key={client.id} title={client.name} detail={client.clientId + ' · ' + client.scopes.join(', ')}>
                <div className="flex gap-2">
                  <button disabled={busy || client.status !== 'ACTIVE'} onClick={() => void action('oauth-clients/' + client.id + '/rotate-secret')} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300">Rotate</button>
                  <button disabled={busy || client.status !== 'ACTIVE'} onClick={() => void action('oauth-clients/' + client.id + '/revoke')} className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs text-red-300">{client.status}</button>
                </div>
              </Row>
            ))}
          </Panel>

          <Panel title="Webhook endpoints">
            {webhooks.map((hook) => (
              <Row key={hook.id} title={hook.name} detail={hook.url + ' · ' + hook.events.join(', ') + ' · failures ' + hook.failureCount}>
                <button disabled={busy} onClick={() => void action('webhooks/' + hook.id + '/rotate-secret')} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300">Rotate secret</button>
              </Row>
            ))}
          </Panel>

          <Panel title="Recent webhook deliveries">
            {deliveries.map((delivery) => (
              <Row key={delivery.id} title={delivery.eventType} detail={delivery.status + ' · attempt ' + delivery.attempts + (delivery.responseStatus ? ' · HTTP ' + delivery.responseStatus : '')}>
                <span className={delivery.status === 'DELIVERED' ? 'text-xs text-emerald-300' : 'text-xs text-zinc-500'}>{new Date(delivery.createdAt).toLocaleString()}</span>
              </Row>
            ))}
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-4 space-y-2">{children}</div>
    </section>
  );
}

function Row({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] p-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="mt-1 max-w-[760px] truncate font-mono text-[10px] text-zinc-600">{detail}</div>
      </div>
      {children}
    </div>
  );
}

function split(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
