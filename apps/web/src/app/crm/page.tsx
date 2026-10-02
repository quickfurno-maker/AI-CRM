'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type Contact = {
  id: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
};

type Company = {
  id: string;
  name: string;
  domain?: string | null;
  industry?: string | null;
};

type Lead = {
  id: string;
  title: string;
  contactId?: string | null;
  stageId: string;
  status: string;
  temperature: string;
  estimatedValue?: string | null;
};

type Deal = {
  id: string;
  name: string;
  leadId?: string | null;
  contactId?: string | null;
  stageId: string;
  status: string;
  amount?: string | null;
  probability: number;
};

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt?: string | null;
};

type Appointment = {
  id: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
  location?: string | null;
};

type Activity = {
  id: string;
  type: string;
  direction?: string | null;
  subject?: string | null;
  body?: string | null;
  occurredAt: string;
};

type Stage = {
  id: string;
  key: string;
  name: string;
  position: number;
  probability: number;
};

type Pipeline = {
  id: string;
  name: string;
  stages: Stage[];
};

type Tab =
  | 'contacts'
  | 'companies'
  | 'leads'
  | 'deals'
  | 'tasks'
  | 'appointments'
  | 'activity';

const input =
  'h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-indigo-400/60';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/crm/' + path, {
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

export default function CrmPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('leads');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [leadPipeline, setLeadPipeline] = useState<Pipeline>();
  const [dealPipeline, setDealPipeline] = useState<Pipeline>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await Promise.all([
        api<Contact[]>('contacts?limit=100'),
        api<Company[]>('companies?limit=100'),
        api<Lead[]>('leads?limit=100'),
        api<Deal[]>('deals?limit=100'),
        api<Task[]>('tasks?limit=100'),
        api<Appointment[]>('appointments?limit=100'),
        api<Activity[]>('activities?limit=100'),
        api<Pipeline>('pipelines?objectType=LEAD'),
        api<Pipeline>('pipelines?objectType=DEAL'),
      ]);
      setContacts(result[0]);
      setCompanies(result[1]);
      setLeads(result[2]);
      setDeals(result[3]);
      setTasks(result[4]);
      setAppointments(result[5]);
      setActivities(result[6]);
      setLeadPipeline(result[7]);
      setDealPipeline(result[8]);
    } catch (reason) {
      if (reason instanceof Error && reason.message === 'AUTH') {
        router.replace('/login');
        return;
      }
      setError(reason instanceof Error ? reason.message : 'Unable to load CRM.');
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const contactMap = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact.displayName])),
    [contacts],
  );
  async function submit(
    event: FormEvent<HTMLFormElement>,
    path: string,
    build: (form: FormData) => Record<string, unknown>,
  ) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const element = event.currentTarget;
    try {
      const form = new FormData(element);
      await api(path, {
        method: 'POST',
        body: JSON.stringify(build(form)),
      });
      element.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }

  async function moveRecord(
    kind: 'leads' | 'deals',
    id: string,
    stageId: string,
  ) {
    try {
      await api(kind + '/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ stageId }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to move record.');
    }
  }

  const counts = [
    ['Contacts', contacts.length],
    ['Active Leads', leads.filter((lead) => lead.status === 'OPEN').length],
    ['Deals', deals.length],
    ['Open Tasks', tasks.filter((task) => task.status !== 'DONE').length],
  ];

  return (
    <main className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto grid min-h-screen max-w-[1800px] lg:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-white/10 bg-[#0b0e14] p-5 lg:block">
          <div className="mb-8 px-2">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300">
              Business OS
            </div>
            <div className="mt-2 text-lg font-semibold">CRM</div>
          </div>
          <nav className="space-y-1 text-sm">
            <Link href="/dashboard" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              Command Center
            </Link>
            <div className="rounded-xl bg-white/10 px-3 py-2.5 text-white">CRM</div>
            {['Inbox', 'AI Agents', 'Automations', 'Attendance', 'Billing', 'Analytics'].map((item) => (
              <div key={item} className="rounded-xl px-3 py-2.5 text-zinc-600">{item}</div>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 p-4 sm:p-7 lg:p-9">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Universal CRM
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sales Workspace</h1>
              <p className="mt-2 text-sm text-zinc-500">
                Contacts, companies, pipelines, deals and follow-up.
              </p>
            </div>
            <button onClick={() => void load()} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5">
              Refresh
            </button>
          </header>

          {error ? (
            <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {counts.map(([label, value]) => (
              <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</div>
                <div className="mt-3 text-2xl font-semibold">{value}</div>
              </article>
            ))}
          </div>

          <div className="mt-6 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.025] p-1">
            {(['contacts', 'companies', 'leads', 'deals', 'tasks', 'appointments', 'activity'] as Tab[]).map((item) => (
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

          {tab === 'contacts' ? (
            <ContactPanel
              contacts={contacts}
              busy={busy}
              onSubmit={(event) =>
                void submit(event, 'contacts', (form) => ({
                  displayName: form.get('displayName'),
                  email: form.get('email') || undefined,
                  phone: form.get('phone') || undefined,
                  source: form.get('source') || undefined,
                }))
              }
            />
          ) : null}

          {tab === 'companies' ? (
            <CompanyPanel
              companies={companies}
              busy={busy}
              onSubmit={(event) =>
                void submit(event, 'companies', (form) => ({
                  name: form.get('name'),
                  domain: form.get('domain') || undefined,
                  industry: form.get('industry') || undefined,
                  phone: form.get('phone') || undefined,
                }))
              }
            />
          ) : null}

          {tab === 'leads' && leadPipeline ? (
            <div className="mt-6 space-y-5">
              <LeadForm
                contacts={contacts}
                busy={busy}
                onSubmit={(event) =>
                  void submit(event, 'leads', (form) => ({
                    title: form.get('title'),
                    contactId: form.get('contactId') || undefined,
                    source: form.get('source') || undefined,
                    temperature: form.get('temperature') || 'COLD',
                    estimatedValue: form.get('estimatedValue') || undefined,
                  }))
                }
              />
              <PipelineBoard
                stages={leadPipeline.stages}
                records={leads.map((lead) => ({
                  id: lead.id,
                  title: lead.title,
                  stageId: lead.stageId,
                  badge: lead.temperature,
                  detail: lead.contactId ? contactMap.get(lead.contactId) : undefined,
                  value: lead.estimatedValue,
                }))}
                onMove={(id, stageId) => void moveRecord('leads', id, stageId)}
              />
            </div>
          ) : null}

          {tab === 'deals' && dealPipeline ? (
            <div className="mt-6 space-y-5">
              <DealForm
                contacts={contacts}
                leads={leads}
                busy={busy}
                onSubmit={(event) =>
                  void submit(event, 'deals', (form) => ({
                    name: form.get('name'),
                    leadId: form.get('leadId') || undefined,
                    contactId: form.get('contactId') || undefined,
                    amount: form.get('amount') || undefined,
                  }))
                }
              />
              <PipelineBoard
                stages={dealPipeline.stages}
                records={deals.map((deal) => ({
                  id: deal.id,
                  title: deal.name,
                  stageId: deal.stageId,
                  badge: String(deal.probability) + '%',
                  detail: deal.contactId ? contactMap.get(deal.contactId) : undefined,
                  value: deal.amount,
                }))}
                onMove={(id, stageId) => void moveRecord('deals', id, stageId)}
              />
            </div>
          ) : null}

          {tab === 'tasks' ? (
            <TaskPanel
              tasks={tasks}
              deals={deals}
              busy={busy}
              onSubmit={(event) =>
                void submit(event, 'tasks', (form) => ({
                  title: form.get('title'),
                  dealId: form.get('dealId') || undefined,
                  priority: form.get('priority') || 'NORMAL',
                  dueAt: form.get('dueAt')
                    ? new Date(String(form.get('dueAt'))).toISOString()
                    : undefined,
                }))
              }
            />
          ) : null}

          {tab === 'appointments' ? (
            <AppointmentPanel
              appointments={appointments}
              contacts={contacts}
              deals={deals}
              busy={busy}
              onSubmit={(event) =>
                void submit(event, 'appointments', (form) => ({
                  title: form.get('title'),
                  contactId: form.get('contactId') || undefined,
                  dealId: form.get('dealId') || undefined,
                  startsAt: new Date(String(form.get('startsAt'))).toISOString(),
                  endsAt: new Date(String(form.get('endsAt'))).toISOString(),
                  location: form.get('location') || undefined,
                }))
              }
            />
          ) : null}

          {tab === 'activity' ? (
            <ActivityPanel
              activities={activities}
              contacts={contacts}
              deals={deals}
              busy={busy}
              onSubmit={(event) =>
                void submit(event, 'activities', (form) => ({
                  type: form.get('type'),
                  direction: form.get('direction') || undefined,
                  contactId: form.get('contactId') || undefined,
                  dealId: form.get('dealId') || undefined,
                  subject: form.get('subject') || undefined,
                  body: form.get('body') || undefined,
                }))
              }
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function ContactPanel({
  contacts,
  busy,
  onSubmit,
}: {
  contacts: Contact[];
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[360px_1fr]">
      <form onSubmit={onSubmit} className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <h2 className="font-semibold">New contact</h2>
        <div className="mt-4 grid gap-3">
          <input className={input} name="displayName" placeholder="Full name" required />
          <input className={input} name="email" type="email" placeholder="Email" />
          <input className={input} name="phone" placeholder="Phone" />
          <input className={input} name="source" placeholder="Source e.g. META" />
          <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60">
            Add contact
          </button>
        </div>
      </form>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1017]">
        <div className="border-b border-white/10 px-5 py-4 font-semibold">Contacts</div>
        <div className="divide-y divide-white/[0.07]">
          {contacts.map((contact) => (
            <div key={contact.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[1.2fr_1fr_1fr_.7fr]">
              <span className="font-medium">{contact.displayName}</span>
              <span className="text-sm text-zinc-500">{contact.email ?? '—'}</span>
              <span className="text-sm text-zinc-500">{contact.phone ?? '—'}</span>
              <span className="text-xs text-zinc-600">{contact.source ?? 'Direct'}</span>
            </div>
          ))}
          {!contacts.length ? <div className="px-5 py-10 text-center text-sm text-zinc-600">No contacts yet.</div> : null}
        </div>
      </div>
    </div>
  );
}

function CompanyPanel({
  companies,
  busy,
  onSubmit,
}: {
  companies: Company[];
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[360px_1fr]">
      <form onSubmit={onSubmit} className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <h2 className="font-semibold">New company</h2>
        <div className="mt-4 grid gap-3">
          <input className={input} name="name" placeholder="Company name" required />
          <input className={input} name="domain" placeholder="Domain" />
          <input className={input} name="industry" placeholder="Industry" />
          <input className={input} name="phone" placeholder="Phone" />
          <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60">
            Add company
          </button>
        </div>
      </form>
      <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <h2 className="font-semibold">Companies</h2>
        <div className="mt-4 space-y-2">
          {companies.map((company) => (
            <div key={company.id} className="rounded-xl border border-white/[0.07] px-4 py-3">
              <div className="font-medium">{company.name}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {company.industry ?? company.domain ?? 'No industry set'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LeadForm({
  contacts,
  busy,
  onSubmit,
}: {
  contacts: Contact[];
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap gap-3 rounded-2xl border border-white/10 bg-[#0d1017] p-4">
      <input className={input + ' min-w-52 flex-1'} name="title" placeholder="Lead title" required />
      <select className={input} name="contactId" defaultValue="">
        <option value="">No contact</option>
        {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}
      </select>
      <input className={input} name="source" placeholder="Source" />
      <select className={input} name="temperature" defaultValue="COLD">
        <option>COLD</option><option>WARM</option><option>HOT</option>
      </select>
      <input className={input} name="estimatedValue" inputMode="decimal" placeholder="Potential value" />
      <button disabled={busy} className="h-10 rounded-xl bg-white px-5 text-sm font-semibold text-zinc-950 disabled:opacity-60">
        Add lead
      </button>
    </form>
  );
}

function DealForm({
  contacts,
  leads,
  busy,
  onSubmit,
}: {
  contacts: Contact[];
  leads: Lead[];
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap gap-3 rounded-2xl border border-white/10 bg-[#0d1017] p-4">
      <input className={input + ' min-w-52 flex-1'} name="name" placeholder="Deal name" required />
      <select className={input} name="leadId" defaultValue="">
        <option value="">No lead</option>
        {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.title}</option>)}
      </select>
      <select className={input} name="contactId" defaultValue="">
        <option value="">No contact</option>
        {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}
      </select>
      <input className={input} name="amount" inputMode="decimal" placeholder="Deal value" />
      <button disabled={busy} className="h-10 rounded-xl bg-white px-5 text-sm font-semibold text-zinc-950 disabled:opacity-60">
        Add deal
      </button>
    </form>
  );
}

function TaskPanel({
  tasks,
  deals,
  busy,
  onSubmit,
}: {
  tasks: Task[];
  deals: Deal[];
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[380px_1fr]">
      <form onSubmit={onSubmit} className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <h2 className="font-semibold">New task</h2>
        <div className="mt-4 grid gap-3">
          <input className={input} name="title" placeholder="Task title" required />
          <select className={input} name="dealId" defaultValue="">
            <option value="">No deal</option>
            {deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.name}</option>)}
          </select>
          <select className={input} name="priority" defaultValue="NORMAL">
            <option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option>
          </select>
          <input className={input} name="dueAt" type="datetime-local" />
          <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60">
            Add task
          </button>
        </div>
      </form>
      <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <h2 className="font-semibold">Tasks</h2>
        <div className="mt-4 space-y-2">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] px-4 py-3">
              <div>
                <div className="font-medium">{task.title}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {task.dueAt ? new Date(task.dueAt).toLocaleString() : 'No due date'}
                </div>
              </div>
              <span className="text-xs text-zinc-400">{task.priority} · {task.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AppointmentPanel({
  appointments,
  contacts,
  deals,
  busy,
  onSubmit,
}: {
  appointments: Appointment[];
  contacts: Contact[];
  deals: Deal[];
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[400px_1fr]">
      <form
        onSubmit={onSubmit}
        className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5"
      >
        <h2 className="font-semibold">New appointment</h2>
        <div className="mt-4 grid gap-3">
          <input className={input} name="title" placeholder="Appointment title" required />
          <select className={input} name="contactId" defaultValue="">
            <option value="">No contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>{contact.displayName}</option>
            ))}
          </select>
          <select className={input} name="dealId" defaultValue="">
            <option value="">No deal</option>
            {deals.map((deal) => (
              <option key={deal.id} value={deal.id}>{deal.name}</option>
            ))}
          </select>
          <label className="grid gap-1 text-xs text-zinc-500">
            Start
            <input className={input} name="startsAt" type="datetime-local" required />
          </label>
          <label className="grid gap-1 text-xs text-zinc-500">
            End
            <input className={input} name="endsAt" type="datetime-local" required />
          </label>
          <input className={input} name="location" placeholder="Location or meeting link" />
          <button
            disabled={busy}
            className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60"
          >
            Schedule
          </button>
        </div>
      </form>
      <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <h2 className="font-semibold">Appointments</h2>
        <div className="mt-4 space-y-2">
          {appointments.map((appointment) => (
            <div
              key={appointment.id}
              className="rounded-xl border border-white/[0.07] px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{appointment.title}</span>
                <span className="text-xs text-indigo-300">{appointment.status}</span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {new Date(appointment.startsAt).toLocaleString()} –{' '}
                {new Date(appointment.endsAt).toLocaleString()}
              </div>
              {appointment.location ? (
                <div className="mt-1 text-xs text-zinc-600">{appointment.location}</div>
              ) : null}
            </div>
          ))}
          {!appointments.length ? (
            <div className="py-10 text-center text-sm text-zinc-600">No appointments yet.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActivityPanel({
  activities,
  contacts,
  deals,
  busy,
  onSubmit,
}: {
  activities: Activity[];
  contacts: Contact[];
  deals: Deal[];
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[400px_1fr]">
      <form
        onSubmit={onSubmit}
        className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5"
      >
        <h2 className="font-semibold">Log activity</h2>
        <div className="mt-4 grid gap-3">
          <select className={input} name="type" defaultValue="CALL">
            <option>CALL</option>
            <option>EMAIL</option>
            <option>WHATSAPP</option>
            <option>MEETING</option>
            <option>OTHER</option>
          </select>
          <select className={input} name="direction" defaultValue="OUTBOUND">
            <option>OUTBOUND</option>
            <option>INBOUND</option>
            <option>INTERNAL</option>
          </select>
          <select className={input} name="contactId" defaultValue="">
            <option value="">No contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>{contact.displayName}</option>
            ))}
          </select>
          <select className={input} name="dealId" defaultValue="">
            <option value="">No deal</option>
            {deals.map((deal) => (
              <option key={deal.id} value={deal.id}>{deal.name}</option>
            ))}
          </select>
          <input className={input} name="subject" placeholder="Subject" />
          <textarea
            name="body"
            placeholder="Notes"
            rows={4}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-indigo-400/60"
          />
          <button
            disabled={busy}
            className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60"
          >
            Log activity
          </button>
        </div>
      </form>
      <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <h2 className="font-semibold">Activity timeline</h2>
        <div className="mt-4 space-y-3">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="rounded-xl border border-white/[0.07] px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">
                  {activity.type}
                  {activity.direction ? ' · ' + activity.direction : ''}
                </div>
                <div className="text-xs text-zinc-600">
                  {new Date(activity.occurredAt).toLocaleString()}
                </div>
              </div>
              {activity.subject ? (
                <div className="mt-2 text-sm text-zinc-300">{activity.subject}</div>
              ) : null}
              {activity.body ? (
                <div className="mt-1 text-sm leading-6 text-zinc-500">{activity.body}</div>
              ) : null}
            </div>
          ))}
          {!activities.length ? (
            <div className="py-10 text-center text-sm text-zinc-600">No activity yet.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PipelineBoard({
  stages,
  records,
  onMove,
}: {
  stages: Stage[];
  records: Array<{
    id: string;
    title: string;
    stageId: string;
    badge?: string;
    detail?: string;
    value?: string | null;
  }>;
  onMove: (id: string, stageId: string) => void;
}) {
  return (
    <div className="overflow-x-auto pb-2">
      <div
        className="grid min-w-[900px] gap-3"
        style={{ gridTemplateColumns: 'repeat(' + stages.length + ', minmax(210px, 1fr))' }}
      >
        {stages.map((stage) => {
          const items = records.filter((record) => record.stageId === stage.id);
          return (
            <section
              key={stage.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const id = event.dataTransfer.getData('text/crm-record');
                if (id) onMove(id, stage.id);
              }}
              className="min-h-72 rounded-2xl border border-white/10 bg-[#0d1017] p-3"
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="text-sm font-medium">{stage.name}</span>
                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-zinc-500">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((record) => (
                  <article
                    key={record.id}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData('text/crm-record', record.id)}
                    className="cursor-grab rounded-xl border border-white/[0.08] bg-white/[0.035] p-3 active:cursor-grabbing"
                  >
                    <div className="text-sm font-medium">{record.title}</div>
                    {record.detail ? <div className="mt-1 text-xs text-zinc-500">{record.detail}</div> : null}
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                      <span className="text-indigo-300">{record.badge}</span>
                      <span className="text-zinc-500">
                        {record.value ? '₹' + Number(record.value).toLocaleString('en-IN') : ''}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
