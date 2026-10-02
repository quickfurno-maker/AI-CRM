'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type MetaConnection = {
  id: string;
  connectionStatus: string;
  clientAssetOwnership: string;
  partnerRole: string;
  billingMode: string;
  wabaId?: string | null;
  metaBusinessPortfolioId?: string | null;
  connectedAt?: string | null;
};

type Channel = {
  id: string;
  provider: string;
  channelType: string;
  providerAccountId?: string | null;
  providerPhoneNumberId?: string | null;
  displayName?: string | null;
  displayAddress?: string | null;
  status: string;
};

type Conversation = {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone?: string | null;
  channelAccountId: string;
  assignedMemberId?: string | null;
  status: string;
  handlingMode: 'HUMAN' | 'AI' | 'AI_ASSIST';
  unreadCount: number;
  lastInboundAt?: string | null;
  lastMessageAt?: string | null;
};

type Message = {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  messageType: string;
  textBody?: string | null;
  status: string;
  providerStatus?: string | null;
  providerTimestamp?: string | null;
  createdAt: string;
};

type Template = {
  id: string;
  channelAccountId: string;
  name: string;
  language: string;
  category?: string | null;
  status: string;
  quality?: string | null;
};

type Campaign = {
  id: string;
  name: string;
  status: string;
  scheduledAt?: string | null;
  createdAt: string;
};

type SignupStart = {
  connectionId: string;
  state: string;
  appId: string;
  configId: string;
  graphVersion?: string;
};

type Tab = 'inbox' | 'templates' | 'campaigns' | 'settings';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/communication/' + path, {
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

declare global {
  interface Window {
    FB?: {
      init(input: {
        appId: string;
        cookie?: boolean;
        xfbml?: boolean;
        version?: string;
      }): void;
      login(
        callback: (result: {
          authResponse?: { code?: string; accessToken?: string };
          status?: string;
        }) => void,
        options: Record<string, unknown>,
      ): void;
    };
    fbAsyncInit?: () => void;
  }
}

function loadFacebookSdk(appId: string, version?: string) {
  return new Promise<void>((resolve, reject) => {
    if (window.FB) {
      window.FB.init({
        appId,
        cookie: true,
        xfbml: false,
        version,
      });
      resolve();
      return;
    }

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId,
        cookie: true,
        xfbml: false,
        version,
      });
      resolve();
    };

    const existing = document.getElementById('facebook-jssdk');
    if (existing) return;

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Unable to load Meta SDK.'));
    document.body.appendChild(script);
  });
}
export default function WhatsAppPage() {
  const [tab, setTab] = useState<Tab>('inbox');
  const [connections, setConnections] = useState<MetaConnection[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await Promise.all([
        api<MetaConnection[]>('meta/connections'),
        api<Channel[]>('channels'),
        api<Conversation[]>('conversations'),
        api<Template[]>('templates'),
        api<Campaign[]>('campaigns'),
      ]);
      setConnections(result[0]);
      setChannels(result[1]);
      setConversations(result[2]);
      setTemplates(result[3]);
      setCampaigns(result[4]);
      setSelectedId((current) => current ?? result[2][0]?.id);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load WhatsApp.');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => {
      void api<Message[]>('conversations/' + selectedId + '/messages')
        .then(setMessages)
        .catch((reason: Error) => setError(reason.message));
      void api('conversations/' + selectedId + '/read', {
        method: 'POST',
      }).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedId]);

  const selected = conversations.find((item) => item.id === selectedId);

  async function sendText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    const text = String(form.get('text') ?? '').trim();
    if (!text) return;
    setBusy(true);
    try {
      await api('conversations/' + selectedId + '/messages/text', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      element.reset();
      setMessages(
        await api<Message[]>('conversations/' + selectedId + '/messages'),
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to send.');
    } finally {
      setBusy(false);
    }
  }

  async function setMode(mode: Conversation['handlingMode']) {
    if (!selectedId) return;
    try {
      await api('conversations/' + selectedId, {
        method: 'PATCH',
        body: JSON.stringify({ handlingMode: mode }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to change mode.');
    }
  }
  async function connectMeta() {
    setBusy(true);
    setError('');
    try {
      const start = await api<SignupStart>('meta/embedded-signup/begin', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await loadFacebookSdk(start.appId, start.graphVersion);

      const session = await new Promise<{
        wabaId: string;
        phoneNumberId: string;
        businessPortfolioId?: string;
        authorizationCode?: string;
        accessToken?: string;
      }>((resolve, reject) => {
        let signupResult:
          | {
              wabaId: string;
              phoneNumberId: string;
              businessPortfolioId?: string;
            }
          | undefined;
        let authorization:
          | { authorizationCode?: string; accessToken?: string }
          | undefined;

        const finishIfReady = () => {
          if (authorization && signupResult) {
            window.removeEventListener('message', listener);
            resolve({
              ...signupResult,
              ...authorization,
            });
          }
        };

        const listener = (event: MessageEvent) => {
          if (
            event.origin !== 'https://www.facebook.com' &&
            event.origin !== 'https://web.facebook.com'
          ) {
            return;
          }

          let data: unknown = event.data;
          if (typeof data === 'string') {
            try {
              data = JSON.parse(data);
            } catch {
              return;
            }
          }
          if (!data || typeof data !== 'object') return;

          const payload = data as {
            type?: string;
            event?: string;
            data?: {
              waba_id?: string;
              phone_number_id?: string;
              business_id?: string;
            };
          };

          if (
            payload.type === 'WA_EMBEDDED_SIGNUP' &&
            payload.event === 'FINISH' &&
            payload.data?.waba_id &&
            payload.data.phone_number_id
          ) {
            signupResult = {
              wabaId: payload.data.waba_id,
              phoneNumberId: payload.data.phone_number_id,
              businessPortfolioId: payload.data.business_id,
            };
            finishIfReady();
          }
        };

        window.addEventListener('message', listener);

        window.FB?.login(
          (result) => {
            const authorizationCode = result.authResponse?.code;
            const accessToken = result.authResponse?.accessToken;
            if (authorizationCode || accessToken) {
              authorization = { authorizationCode, accessToken };
              finishIfReady();
              return;
            }
            window.removeEventListener('message', listener);
            reject(
              new Error(
                'Meta Embedded Signup did not return an authorization credential.',
              ),
            );
          },
          {
            config_id: start.configId,
            auth_type: 'rerequest',
            response_type: 'code',
            override_default_response_type: true,
            extras: { setup: {} },
          },
        );
      });

      await api('meta/embedded-signup/complete', {
        method: 'POST',
        body: JSON.stringify({
          connectionId: start.connectionId,
          signupState: start.state,
          authorizationCode: session.authorizationCode,
          accessToken: session.accessToken,
          wabaId: session.wabaId,
          phoneNumberId: session.phoneNumberId,
          businessPortfolioId: session.businessPortfolioId,
        }),
      });
      await load();
      setTab('settings');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to connect Meta.');
    } finally {
      setBusy(false);
    }
  }

  async function registerPhone(
    event: FormEvent<HTMLFormElement>,
    connectionId: string,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api('meta/connections/' + connectionId + '/register-phone', {
        method: 'POST',
        body: JSON.stringify({ pin: form.get('pin') }),
      });
      event.currentTarget.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  }
  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const channelAccountId = String(form.get('channelAccountId') ?? '');
    const body = String(form.get('body') ?? '').trim();
    setBusy(true);
    try {
      await api('templates', {
        method: 'POST',
        body: JSON.stringify({
          channelAccountId,
          name: form.get('name'),
          language: form.get('language') || 'en',
          category: form.get('category') || 'UTILITY',
          components: [{ type: 'BODY', text: body }],
        }),
      });
      event.currentTarget.reset();
      setTemplates(await api<Template[]>('templates'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create template.');
    } finally {
      setBusy(false);
    }
  }

  async function submitTemplate(templateId: string) {
    setBusy(true);
    try {
      await api('templates/' + templateId + '/submit', {
        method: 'POST',
      });
      setTemplates(await api<Template[]>('templates'));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Template submission failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function syncTemplates(channelId: string) {
    setBusy(true);
    try {
      setTemplates(
        await api<Template[]>('channels/' + channelId + '/templates/sync', {
          method: 'POST',
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Template sync failed.');
    } finally {
      setBusy(false);
    }
  }

  async function queueCampaign(campaignId: string) {
    setBusy(true);
    try {
      const result = await api<{
        recipientCount: number;
      }>('campaigns/' + campaignId + '/queue', {
        method: 'POST',
      });
      setCampaigns(await api<Campaign[]>('campaigns'));
      if (!result.recipientCount) {
        setError(
          'No eligible WhatsApp recipients matched the campaign consent/audience rules.',
        );
      } else {
        setError('');
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to queue campaign.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api('campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          channelAccountId: form.get('channelAccountId'),
          templateId: form.get('templateId'),
          scheduledAt: form.get('scheduledAt')
            ? new Date(String(form.get('scheduledAt'))).toISOString()
            : undefined,
          audienceFilters: {},
        }),
      });
      event.currentTarget.reset();
      setCampaigns(await api<Campaign[]>('campaigns'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create campaign.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto grid min-h-screen max-w-[1800px] lg:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-white/10 bg-[#0b0e14] p-5 lg:block">
          <div className="mb-8 px-2">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
              Business OS
            </div>
            <div className="mt-2 text-lg font-semibold">WhatsApp</div>
          </div>
          <nav className="space-y-1 text-sm">
            <Link href="/dashboard" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              Command Center
            </Link>
            <Link href="/crm" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              CRM
            </Link>
            <div className="rounded-xl bg-white/10 px-3 py-2.5 text-white">
              WhatsApp
            </div>
            {['AI Agents', 'Automations', 'Attendance', 'Billing', 'Analytics'].map((item) => (
              <div key={item} className="rounded-xl px-3 py-2.5 text-zinc-600">{item}</div>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 p-4 sm:p-7 lg:p-9">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Meta Partner Platform
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                WhatsApp Control Center
              </h1>
              <p className="mt-2 text-sm text-zinc-500">
                Client-owned WABA · unified inbox · templates · campaigns.
              </p>
            </div>
            <button
              onClick={() => void load()}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
            >
              Refresh
            </button>
          </header>

          {error ? (
            <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-6 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.025] p-1">
            {(['inbox', 'templates', 'campaigns', 'settings'] as Tab[]).map((item) => (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={
                  'rounded-lg px-4 py-2 text-sm capitalize transition ' +
                  (tab === item
                    ? 'bg-white/10 text-white'
                    : 'text-zinc-500 hover:text-zinc-300')
                }
              >
                {item}
              </button>
            ))}
          </div>
          {tab === 'inbox' ? (
            <div className="mt-6 grid min-h-[650px] overflow-hidden rounded-2xl border border-white/10 bg-[#0d1017] xl:grid-cols-[340px_1fr]">
              <div className="border-b border-white/10 xl:border-b-0 xl:border-r">
                <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold">
                  Conversations
                </div>
                <div className="max-h-[650px] overflow-y-auto">
                  {conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      onClick={() => setSelectedId(conversation.id)}
                      className={
                        'block w-full border-b border-white/[0.06] px-4 py-4 text-left ' +
                        (selectedId === conversation.id
                          ? 'bg-white/[0.07]'
                          : 'hover:bg-white/[0.035]')
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium">
                          {conversation.contactName}
                        </span>
                        {conversation.unreadCount ? (
                          <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-[11px] font-semibold text-zinc-950">
                            {conversation.unreadCount}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {conversation.contactPhone ?? 'WhatsApp'}
                      </div>
                      <div className="mt-2 text-[11px] text-zinc-600">
                        {conversation.handlingMode}
                        {conversation.lastMessageAt
                          ? ' · ' + new Date(conversation.lastMessageAt).toLocaleString()
                          : ''}
                      </div>
                    </button>
                  ))}
                  {!conversations.length ? (
                    <div className="px-4 py-16 text-center text-sm text-zinc-600">
                      No conversations yet.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex min-h-[650px] flex-col">
                {selected ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                      <div>
                        <div className="font-semibold">{selected.contactName}</div>
                        <div className="text-xs text-zinc-500">{selected.contactPhone}</div>
                      </div>
                      <div className="flex gap-1 rounded-xl border border-white/10 p-1">
                        {(['HUMAN', 'AI_ASSIST', 'AI'] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => void setMode(mode)}
                            className={
                              'rounded-lg px-3 py-1.5 text-xs ' +
                              (selected.handlingMode === mode
                                ? 'bg-white/10 text-white'
                                : 'text-zinc-500')
                            }
                          >
                            {mode.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex-1 space-y-3 overflow-y-auto p-5">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={
                            'flex ' +
                            (message.direction === 'OUTBOUND'
                              ? 'justify-end'
                              : 'justify-start')
                          }
                        >
                          <div
                            className={
                              'max-w-[80%] rounded-2xl px-4 py-3 text-sm ' +
                              (message.direction === 'OUTBOUND'
                                ? 'bg-emerald-400/15 text-emerald-50'
                                : 'bg-white/[0.06] text-zinc-200')
                            }
                          >
                            <div>{message.textBody ?? '[' + message.messageType + ']'}</div>
                            <div className="mt-1 text-[10px] text-zinc-600">
                              {message.status}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <form onSubmit={sendText} className="border-t border-white/10 p-4">
                      <div className="flex gap-3">
                        <input
                          name="text"
                          placeholder="Reply on WhatsApp…"
                          className="h-11 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm outline-none focus:border-emerald-400/50"
                        />
                        <button
                          disabled={busy}
                          className="rounded-xl bg-emerald-400 px-5 text-sm font-semibold text-zinc-950 disabled:opacity-60"
                        >
                          Send
                        </button>
                      </div>
                      <div className="mt-2 text-[11px] text-zinc-600">
                        Free-form replies are server-blocked outside Meta&apos;s customer-service window.
                      </div>
                    </form>
                  </>
                ) : (
                  <div className="grid flex-1 place-items-center text-sm text-zinc-600">
                    Select a conversation.
                  </div>
                )}
              </div>
            </div>
          ) : null}
          {tab === 'templates' ? (
            <div className="mt-6 grid gap-5 xl:grid-cols-[390px_1fr]">
              <form onSubmit={createTemplate} className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                <h2 className="font-semibold">Template Studio</h2>
                <div className="mt-4 grid gap-3">
                  <select name="channelAccountId" required className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm">
                    <option value="">Select WhatsApp number</option>
                    {channels.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.displayName ?? channel.displayAddress ?? channel.providerPhoneNumberId}
                      </option>
                    ))}
                  </select>
                  <input name="name" required placeholder="template_name" className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm" />
                  <input name="language" defaultValue="en" className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm" />
                  <select name="category" defaultValue="UTILITY" className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm">
                    <option>UTILITY</option>
                    <option>MARKETING</option>
                    <option>AUTHENTICATION</option>
                  </select>
                  <textarea name="body" required rows={6} placeholder="Template body" className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm" />
                  <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60">
                    Save local draft
                  </button>
                </div>
              </form>

              <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-semibold">Templates</h2>
                  {channels[0] ? (
                    <button
                      onClick={() => void syncTemplates(channels[0].id)}
                      className="rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300"
                    >
                      Sync from Meta
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 space-y-2">
                  {templates.map((template) => (
                    <div key={template.id} className="rounded-xl border border-white/[0.07] px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{template.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-indigo-300">{template.status}</span>
                          {template.status === 'LOCAL_DRAFT' ||
                          template.status === 'REJECTED' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void submitTemplate(template.id)}
                              className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 disabled:opacity-50"
                            >
                              Submit to Meta
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {template.language} · {template.category ?? '—'}
                        {template.quality ? ' · ' + template.quality : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {tab === 'campaigns' ? (
            <div className="mt-6 grid gap-5 xl:grid-cols-[390px_1fr]">
              <form onSubmit={createCampaign} className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                <h2 className="font-semibold">New campaign</h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Audience resolution and consent enforcement happen server-side.
                </p>
                <div className="mt-4 grid gap-3">
                  <input name="name" required placeholder="Campaign name" className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm" />
                  <select name="channelAccountId" required className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm">
                    <option value="">WhatsApp number</option>
                    {channels.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.displayName ?? channel.displayAddress ?? channel.providerPhoneNumberId}
                      </option>
                    ))}
                  </select>
                  <select name="templateId" required className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm">
                    <option value="">Approved template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} · {template.status}
                      </option>
                    ))}
                  </select>
                  <input name="scheduledAt" type="datetime-local" className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm" />
                  <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60">
                    Create campaign
                  </button>
                </div>
              </form>

              <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                <h2 className="font-semibold">Campaigns</h2>
                <div className="mt-4 space-y-2">
                  {campaigns.map((campaign) => (
                    <div key={campaign.id} className="rounded-xl border border-white/[0.07] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{campaign.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-indigo-300">{campaign.status}</span>
                          {campaign.status === 'DRAFT' ||
                          campaign.status === 'SCHEDULED' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void queueCampaign(campaign.id)}
                              className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 disabled:opacity-50"
                            >
                              {campaign.scheduledAt ? 'Queue' : 'Launch'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {campaign.scheduledAt
                          ? 'Scheduled ' + new Date(campaign.scheduledAt).toLocaleString()
                          : campaign.status === 'DRAFT'
                            ? 'Draft'
                            : 'Processing through the campaign worker'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {tab === 'settings' ? (
            <div className="mt-6 space-y-5">
              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">Meta Embedded Signup</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">
                      Clients keep ownership of their Business Portfolio, WABA and phone number. Our platform receives delegated access and operates the service.
                    </p>
                  </div>
                  <button
                    onClick={() => void connectMeta()}
                    disabled={busy}
                    className="rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-60"
                  >
                    Connect WhatsApp
                  </button>
                </div>
              </div>

              <div className="grid gap-4">
                {connections.map((connection) => (
                  <article key={connection.id} className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold">
                          {connection.wabaId ? 'WABA ' + connection.wabaId : 'Meta onboarding'}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {connection.partnerRole} · {connection.clientAssetOwnership} owned · {connection.billingMode}
                        </div>
                      </div>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300">
                        {connection.connectionStatus}
                      </span>
                    </div>

                    {connection.connectionStatus === 'PHONE_REGISTRATION_PENDING' ? (
                      <form
                        onSubmit={(event) => void registerPhone(event, connection.id)}
                        className="mt-4 flex max-w-md gap-3"
                      >
                        <input
                          name="pin"
                          required
                          minLength={6}
                          maxLength={6}
                          inputMode="numeric"
                          placeholder="6-digit two-step PIN"
                          className="h-10 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm"
                        />
                        <button disabled={busy} className="rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950">
                          Register phone
                        </button>
                      </form>
                    ) : null}
                  </article>
                ))}
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                <h2 className="font-semibold">WhatsApp numbers</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {channels.map((channel) => (
                    <div key={channel.id} className="rounded-xl border border-white/[0.07] px-4 py-3">
                      <div className="font-medium">
                        {channel.displayName ?? channel.displayAddress ?? 'WhatsApp'}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        Phone Number ID: {channel.providerPhoneNumberId ?? '—'}
                      </div>
                      <div className="mt-2 text-xs text-emerald-300">{channel.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
