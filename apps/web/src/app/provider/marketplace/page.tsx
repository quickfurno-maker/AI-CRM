'use client';

import Link from 'next/link';
import { WorkspaceLoading } from '@/components/workspace-states';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type Session = { organization: { isPlatformAdmin?: boolean } };
type Listing = {
  id: string;
  key: string;
  name: string;
  version: string;
  publisher: string;
  description: string;
  category: string;
  requiredScopes: string[];
  eventSubscriptions: string[];
  status: string;
  isFirstParty: boolean;
};

const field =
  'h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-violet-400/50';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/platform-admin/' + path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  const body = (await response.json()) as T & { message?: string | string[] };
  if (!response.ok) {
    const message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    throw new Error(message ?? 'Provider marketplace request failed.');
  }
  return body;
}

export default function ProviderMarketplacePage() {
  const [authorized, setAuthorized] = useState<boolean>();
  const [listings, setListings] = useState<Listing[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const sessionResponse = await fetch('/api/session', { cache: 'no-store' });
      if (!sessionResponse.ok) throw new Error('Unable to load provider session.');
      const session = (await sessionResponse.json()) as Session;
      const admin = session.organization.isPlatformAdmin === true;
      setAuthorized(admin);
      if (!admin) return;
      setListings(await api<Listing[]>('marketplace/extensions'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load marketplace publishing.');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError('');
    try {
      const form = new FormData(formElement);
      const key = String(form.get('key'));
      const name = String(form.get('name'));
      const version = String(form.get('version'));
      const publisher = String(form.get('publisher'));
      const description = String(form.get('description'));
      const scopes = split(form.get('scopes'));
      const events = split(form.get('events'));
      await api('marketplace/extensions', {
        method: 'POST',
        body: JSON.stringify({
          key,
          name,
          version,
          publisher,
          description,
          category: String(form.get('category') || 'INTEGRATION'),
          requiredScopes: scopes,
          eventSubscriptions: events,
          manifest: {
            schemaVersion: '1',
            key,
            name,
            version,
            publisher,
            description,
            category: String(form.get('category') || 'INTEGRATION'),
            apiScopes: scopes,
            eventSubscriptions: events,
          },
        }),
      });
      formElement.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to publish marketplace draft.');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusy(true);
    setError('');
    try {
      await api('marketplace/extensions/' + id + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update listing.');
    } finally {
      setBusy(false);
    }
  }

  if (authorized === undefined) {
    return <WorkspaceLoading label="Marketplace Publishing" />;
  }
  if (!authorized) {
    return <main className="grid min-h-screen place-items-center bg-[#07090d] text-zinc-400">Platform administrator access required.</main>;
  }

  return (
    <main className="min-h-screen bg-[#07090d] p-4 text-zinc-100 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">Business OS Provider</div>
            <h1 className="mt-2 text-3xl font-semibold">Marketplace Publishing</h1>
            <p className="mt-2 text-sm text-zinc-500">Review and publish external integrations without running third-party code inside the CRM-AI runtime.</p>
          </div>
          <Link href="/provider" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300">Provider Console</Link>
        </header>

        {error ? <div role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

        <form onSubmit={publish} className="mt-6 rounded-2xl border border-white/10 bg-[#0d1017] p-6">
          <h2 className="font-semibold">Create / update marketplace draft</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input className={field} name="key" placeholder="extension-key" required />
            <input className={field} name="name" placeholder="Extension name" required />
            <input className={field} name="version" placeholder="1.0.0" required />
            <input className={field} name="publisher" placeholder="Publisher" required />
            <input className={field} name="category" placeholder="INTEGRATION" defaultValue="INTEGRATION" />
            <input className={field} name="scopes" placeholder="crm.contact.read" required />
            <input className={field} name="events" placeholder="crm.lead.created.v1" />
            <input className={field} name="description" placeholder="Describe the external integration and its purpose" required />
          </div>
          <button disabled={busy} className="mt-4 h-10 rounded-xl bg-white px-5 text-sm font-semibold text-zinc-950 disabled:opacity-50">Save draft</button>
        </form>

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#0d1017] p-6">
          <h2 className="font-semibold">Listings</h2>
          <div className="mt-4 space-y-2">
            {listings.map((listing) => (
              <div key={listing.id} className="rounded-xl border border-white/[0.07] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{listing.name} <span className="text-xs text-zinc-600">v{listing.version}</span></div>
                    <div className="mt-1 text-xs text-zinc-500">{listing.publisher} · {listing.key} · {listing.category}</div>
                    <div className="mt-2 text-xs text-zinc-600">{listing.requiredScopes.join(', ')}</div>
                  </div>
                  <span className="text-xs text-violet-300">{listing.status}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {['DRAFT', 'REVIEW', 'PUBLISHED', 'SUSPENDED'].map((status) => (
                    <button
                      key={status}
                      disabled={busy || listing.status === status}
                      onClick={() => void setStatus(listing.id, status)}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 disabled:opacity-30"
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!listings.length ? <div className="py-8 text-center text-sm text-zinc-600">No marketplace listings yet.</div> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function split(value: FormDataEntryValue | null) {
  return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}
