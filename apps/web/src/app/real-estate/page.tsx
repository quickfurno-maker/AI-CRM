'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

type Dashboard = {
  projects: number;
  availableUnits: number;
  activeRequirements: number;
  upcomingVisits: number;
  bookings: number;
};

type Contact = {
  id: string;
  displayName: string;
  phone?: string | null;
};

type Project = {
  id: string;
  name: string;
  city: string;
  locality: string;
  status: string;
};

type UnitRow = {
  unit: {
    id: string;
    projectId?: string | null;
    title: string;
    city?: string | null;
    locality?: string | null;
    propertyType: string;
    configuration?: string | null;
    price?: string | null;
    currency: string;
    carpetArea?: string | null;
    inventoryStatus: string;
  };
  projectName?: string | null;
  projectCity?: string | null;
  projectLocality?: string | null;
};

type Requirement = {
  id: string;
  contactId: string;
  purpose: string;
  cities: string[];
  localities: string[];
  propertyTypes: string[];
  configurations: string[];
  minBudget?: string | null;
  maxBudget?: string | null;
  status: string;
  createdAt: string;
};

type MatchRow = {
  match: {
    id: string;
    score: number;
    reasons: string[];
    status: string;
  };
  unit: UnitRow['unit'];
  project?: Project | null;
};

type SiteVisit = {
  id: string;
  contactId: string;
  projectId?: string | null;
  unitId?: string | null;
  scheduledAt: string;
  status: string;
  outcome?: string | null;
};

type Booking = {
  id: string;
  contactId: string;
  unitId: string;
  status: string;
  bookingAmount?: string | null;
  currency: string;
  bookedAt: string;
};

type SessionData = {
  capabilities: {
    entitlements: Array<{ key: string; enabled: boolean }>;
  };
};

type Tab = 'inventory' | 'requirements' | 'visits' | 'bookings';

const field =
  'h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-emerald-400/50';

async function api<T>(
  namespace: 'real-estate' | 'crm',
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch('/api/' + namespace + '/' + path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });

  if (response.status === 401) throw new Error('AUTH');
  const body = (await response.json()) as T & {
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

export default function RealEstatePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('inventory');
  const [enabled, setEnabled] = useState<boolean>();
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedRequirementId, setSelectedRequirementId] = useState<string>();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const sessionResponse = await fetch('/api/session', {
        cache: 'no-store',
      });
      if (sessionResponse.status === 401) {
        router.replace('/login');
        return;
      }
      if (!sessionResponse.ok) {
        throw new Error('Unable to load tenant session.');
      }
      const session = (await sessionResponse.json()) as SessionData;
      const realEstateEnabled =
        session.capabilities.entitlements.find(
          (item) => item.key === 'extension.realestate',
        )?.enabled ?? false;
      setEnabled(realEstateEnabled);
      if (!realEstateEnabled) return;

      const result = await Promise.all([
        api<Dashboard>('real-estate', 'dashboard'),
        api<Contact[]>('crm', 'contacts?limit=100'),
        api<Project[]>('real-estate', 'projects?limit=100'),
        api<UnitRow[]>('real-estate', 'units?limit=100'),
        api<Requirement[]>('real-estate', 'requirements?limit=100'),
        api<SiteVisit[]>('real-estate', 'site-visits?limit=100'),
        api<Booking[]>('real-estate', 'bookings?limit=100'),
      ]);

      setDashboard(result[0]);
      setContacts(result[1]);
      setProjects(result[2]);
      setUnits(result[3]);
      setRequirements(result[4]);
      setVisits(result[5]);
      setBookings(result[6]);
    } catch (reason) {
      if (reason instanceof Error && reason.message === 'AUTH') {
        router.replace('/login');
        return;
      }
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to load Real Estate extension.',
      );
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
  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const unitMap = useMemo(
    () => new Map(units.map((row) => [row.unit.id, row])),
    [units],
  );

  async function submit(
    event: FormEvent<HTMLFormElement>,
    path: string,
    build: (form: FormData) => Record<string, unknown>,
  ) {
    event.preventDefault();
    const element = event.currentTarget;
    setBusy(true);
    setError('');
    try {
      const form = new FormData(element);
      await api('real-estate', path, {
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

  async function matchRequirement(requirementId: string) {
    setBusy(true);
    setError('');
    try {
      await api('real-estate', 'requirements/' + requirementId + '/match', {
        method: 'POST',
        body: JSON.stringify({ limit: 10 }),
      });
      const rows = await api<MatchRow[]>(
        'real-estate',
        'requirements/' + requirementId + '/matches',
      );
      setSelectedRequirementId(requirementId);
      setMatches(rows);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to match properties.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function setVisitStatus(id: string, status: string) {
    setBusy(true);
    try {
      await api('real-estate', 'site-visits/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update visit.');
    } finally {
      setBusy(false);
    }
  }

  async function setBookingStatus(id: string, status: string) {
    setBusy(true);
    try {
      await api('real-estate', 'bookings/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to update booking.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (enabled === undefined) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#07090d] text-sm text-zinc-500">
        Loading Real Estate extension…
      </main>
    );
  }

  if (!enabled) {
    return (
      <main className="min-h-screen bg-[#07090d] p-6 text-zinc-100">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-[#0d1017] p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
            Business OS Extension
          </div>
          <h1 className="mt-3 text-3xl font-semibold">Real Estate</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-500">
            This organization does not currently have the Real Estate extension
            entitlement enabled. Core CRM remains available independently.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300"
          >
            Back to Command Center
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto grid min-h-screen max-w-[1800px] lg:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-white/10 bg-[#0b0e14] p-5 lg:block">
          <div className="mb-8 px-2">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
              Business OS
            </div>
            <div className="mt-2 text-lg font-semibold">Real Estate</div>
            <div className="mt-1 text-xs text-zinc-600">Extension · v1</div>
          </div>
          <nav className="space-y-1 text-sm">
            <Link href="/dashboard" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              Command Center
            </Link>
            <Link href="/crm" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              CRM
            </Link>
            <div className="rounded-xl bg-emerald-400/10 px-3 py-2.5 text-emerald-200">
              Real Estate
            </div>
            <Link href="/whatsapp" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              WhatsApp
            </Link>
            <Link href="/ai-agents" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              AI Agents
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
                Industry Extension · Real Estate
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Property Sales Control Center
              </h1>
              <p className="mt-2 text-sm text-zinc-500">
                Inventory, buyer requirements, matching, visits and bookings on
                top of the universal CRM.
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

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ['Projects', dashboard?.projects ?? 0],
              ['Available units', dashboard?.availableUnits ?? 0],
              ['Active requirements', dashboard?.activeRequirements ?? 0],
              ['Upcoming visits', dashboard?.upcomingVisits ?? 0],
              ['Bookings', dashboard?.bookings ?? 0],
            ].map(([label, value]) => (
              <article
                key={String(label)}
                className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"
              >
                <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                  {label}
                </div>
                <div className="mt-3 text-2xl font-semibold">{value}</div>
              </article>
            ))}
          </div>

          <div className="mt-6 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.025] p-1">
            {(['inventory', 'requirements', 'visits', 'bookings'] as Tab[]).map(
              (item) => (
                <button
                  key={item}
                  onClick={() => setTab(item)}
                  className={
                    'rounded-lg px-4 py-2 text-sm capitalize transition ' +
                    (tab === item
                      ? 'bg-emerald-400/10 text-emerald-200'
                      : 'text-zinc-500 hover:text-zinc-300')
                  }
                >
                  {item}
                </button>
              ),
            )}
          </div>

          {tab === 'inventory' ? (
            <InventoryPanel
              projects={projects}
              units={units}
              busy={busy}
              onProject={(event) =>
                void submit(event, 'projects', (form) => ({
                  name: form.get('name'),
                  city: form.get('city'),
                  locality: form.get('locality'),
                  reraNumber: form.get('reraNumber') || undefined,
                }))
              }
              onUnit={(event) =>
                void submit(event, 'units', (form) => ({
                  projectId: form.get('projectId') || undefined,
                  title: form.get('title'),
                  city: form.get('city') || undefined,
                  locality: form.get('locality') || undefined,
                  propertyType: form.get('propertyType'),
                  configuration: form.get('configuration') || undefined,
                  carpetArea: form.get('carpetArea') || undefined,
                  price: form.get('price') || undefined,
                  inventoryStatus: 'AVAILABLE',
                }))
              }
            />
          ) : null}

          {tab === 'requirements' ? (
            <RequirementsPanel
              contacts={contacts}
              requirements={requirements}
              matches={matches}
              selectedRequirementId={selectedRequirementId}
              busy={busy}
              contactMap={contactMap}
              onRequirement={(event) =>
                void submit(event, 'requirements', (form) => ({
                  contactId: form.get('contactId'),
                  purpose: form.get('purpose'),
                  cities: splitCsv(form.get('cities')),
                  localities: splitCsv(form.get('localities')),
                  propertyTypes: splitCsv(form.get('propertyTypes')),
                  configurations: splitCsv(form.get('configurations')),
                  minBudget: form.get('minBudget') || undefined,
                  maxBudget: form.get('maxBudget') || undefined,
                  minCarpetArea: form.get('minCarpetArea') || undefined,
                  mustHaveAmenities: splitCsv(form.get('amenities')),
                  purchaseTimeline: form.get('purchaseTimeline') || undefined,
                }))
              }
              onMatch={(id) => void matchRequirement(id)}
            />
          ) : null}

          {tab === 'visits' ? (
            <VisitsPanel
              contacts={contacts}
              projects={projects}
              units={units}
              visits={visits}
              busy={busy}
              contactMap={contactMap}
              projectMap={projectMap}
              onVisit={(event) =>
                void submit(event, 'site-visits', (form) => ({
                  contactId: form.get('contactId'),
                  projectId: form.get('projectId') || undefined,
                  unitId: form.get('unitId') || undefined,
                  scheduledAt: new Date(
                    String(form.get('scheduledAt')),
                  ).toISOString(),
                  notes: form.get('notes') || undefined,
                }))
              }
              onStatus={(id, status) => void setVisitStatus(id, status)}
            />
          ) : null}

          {tab === 'bookings' ? (
            <BookingsPanel
              contacts={contacts}
              units={units}
              bookings={bookings}
              busy={busy}
              contactMap={contactMap}
              unitMap={unitMap}
              onBooking={(event) =>
                void submit(event, 'bookings', (form) => ({
                  contactId: form.get('contactId'),
                  unitId: form.get('unitId'),
                  bookingAmount: form.get('bookingAmount') || undefined,
                }))
              }
              onStatus={(id, status) => void setBookingStatus(id, status)}
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function InventoryPanel({
  projects,
  units,
  busy,
  onProject,
  onUnit,
}: {
  projects: Project[];
  units: UnitRow[];
  busy: boolean;
  onProject: (event: FormEvent<HTMLFormElement>) => void;
  onUnit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="mt-6 space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={onProject} className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <h2 className="font-semibold">Add project</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input className={field} name="name" placeholder="Project name" required />
            <input className={field} name="reraNumber" placeholder="RERA number" />
            <input className={field} name="city" placeholder="City" required />
            <input className={field} name="locality" placeholder="Locality" required />
            <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60 sm:col-span-2">
              Add project
            </button>
          </div>
        </form>

        <form onSubmit={onUnit} className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <h2 className="font-semibold">Add property / unit</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input className={field} name="title" placeholder="Listing title" required />
            <select className={field} name="projectId" defaultValue="">
              <option value="">Independent property</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <input className={field} name="city" placeholder="City" />
            <input className={field} name="locality" placeholder="Locality" />
            <select className={field} name="propertyType" defaultValue="APARTMENT">
              <option>APARTMENT</option>
              <option>VILLA</option>
              <option>PLOT</option>
              <option>COMMERCIAL</option>
              <option>OFFICE</option>
              <option>SHOP</option>
            </select>
            <input className={field} name="configuration" placeholder="2 BHK" />
            <input className={field} name="carpetArea" inputMode="decimal" placeholder="Carpet sqft" />
            <input className={field} name="price" inputMode="decimal" placeholder="Price" />
            <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60 sm:col-span-2">
              Add inventory
            </button>
          </div>
        </form>
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1017]">
        <div className="border-b border-white/10 px-5 py-4 font-semibold">
          Inventory
        </div>
        <div className="divide-y divide-white/[0.06]">
          {units.map(({ unit, projectName, projectCity, projectLocality }) => (
            <div
              key={unit.id}
              className="grid gap-3 px-5 py-4 md:grid-cols-[1.3fr_.8fr_.7fr_.7fr_.7fr]"
            >
              <div>
                <div className="font-medium">{unit.title}</div>
                <div className="mt-1 text-xs text-zinc-600">
                  {projectName ?? 'Independent listing'} ·{' '}
                  {unit.locality ?? projectLocality ?? '—'},{' '}
                  {unit.city ?? projectCity ?? '—'}
                </div>
              </div>
              <span className="text-sm text-zinc-400">
                {unit.propertyType} {unit.configuration ?? ''}
              </span>
              <span className="text-sm text-zinc-500">
                {unit.carpetArea ? unit.carpetArea + ' sqft' : '—'}
              </span>
              <span className="text-sm text-zinc-300">
                {unit.price
                  ? '₹' + Number(unit.price).toLocaleString('en-IN')
                  : 'Price on request'}
              </span>
              <span
                className={
                  'text-xs ' +
                  (unit.inventoryStatus === 'AVAILABLE'
                    ? 'text-emerald-300'
                    : 'text-zinc-500')
                }
              >
                {unit.inventoryStatus}
              </span>
            </div>
          ))}
          {!units.length ? (
            <div className="px-5 py-10 text-center text-sm text-zinc-600">
              No inventory yet.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function RequirementsPanel({
  contacts,
  requirements,
  matches,
  selectedRequirementId,
  busy,
  contactMap,
  onRequirement,
  onMatch,
}: {
  contacts: Contact[];
  requirements: Requirement[];
  matches: MatchRow[];
  selectedRequirementId?: string;
  busy: boolean;
  contactMap: Map<string, string>;
  onRequirement: (event: FormEvent<HTMLFormElement>) => void;
  onMatch: (id: string) => void;
}) {
  return (
    <div className="mt-6 grid gap-5 2xl:grid-cols-[410px_1fr]">
      <form onSubmit={onRequirement} className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <h2 className="font-semibold">Buyer requirement</h2>
        <div className="mt-4 grid gap-3">
          <select className={field} name="contactId" defaultValue="" required>
            <option value="" disabled>Select CRM contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.displayName}
              </option>
            ))}
          </select>
          <select className={field} name="purpose" defaultValue="SELF_USE">
            <option>SELF_USE</option>
            <option>INVESTMENT</option>
            <option>RENTAL</option>
          </select>
          <input className={field} name="cities" placeholder="Cities, comma separated" />
          <input className={field} name="localities" placeholder="Localities, comma separated" />
          <input className={field} name="propertyTypes" placeholder="APARTMENT, VILLA..." />
          <input className={field} name="configurations" placeholder="2 BHK, 3 BHK..." />
          <div className="grid grid-cols-2 gap-3">
            <input className={field} name="minBudget" placeholder="Min budget" inputMode="decimal" />
            <input className={field} name="maxBudget" placeholder="Max budget" inputMode="decimal" />
          </div>
          <input className={field} name="minCarpetArea" placeholder="Minimum carpet area" inputMode="decimal" />
          <input className={field} name="amenities" placeholder="Must-have amenities" />
          <input className={field} name="purchaseTimeline" placeholder="Purchase timeline" />
          <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60">
            Create requirement
          </button>
        </div>
      </form>

      <div className="space-y-5">
        <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <h2 className="font-semibold">Requirements</h2>
          <div className="mt-4 space-y-2">
            {requirements.map((requirement) => (
              <div
                key={requirement.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] p-4"
              >
                <div>
                  <div className="font-medium">
                    {contactMap.get(requirement.contactId) ?? 'CRM contact'}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {[...requirement.localities, ...requirement.cities].join(', ') ||
                      'Any location'}{' '}
                    · {requirement.configurations.join(', ') || 'Any configuration'}
                    {requirement.maxBudget
                      ? ' · up to ₹' +
                        Number(requirement.maxBudget).toLocaleString('en-IN')
                      : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">{requirement.status}</span>
                  <button
                    disabled={busy}
                    onClick={() => onMatch(requirement.id)}
                    className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 disabled:opacity-60"
                  >
                    Match
                  </button>
                </div>
              </div>
            ))}
            {!requirements.length ? (
              <div className="py-8 text-center text-sm text-zinc-600">
                No buyer requirements yet.
              </div>
            ) : null}
          </div>
        </section>

        {selectedRequirementId ? (
          <section className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.025] p-5">
            <h2 className="font-semibold">Explainable matches</h2>
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {matches.map(({ match, unit, project }) => (
                <article
                  key={match.id}
                  className="rounded-xl border border-white/[0.08] bg-[#0d1017] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{unit.title}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {project?.name ?? 'Independent'} ·{' '}
                        {unit.configuration ?? unit.propertyType}
                      </div>
                    </div>
                    <div className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                      {match.score}
                    </div>
                  </div>
                  <div className="mt-3 text-xs leading-5 text-zinc-500">
                    {match.reasons.join(' · ')}
                  </div>
                  <div className="mt-3 text-sm text-zinc-300">
                    {unit.price
                      ? '₹' + Number(unit.price).toLocaleString('en-IN')
                      : 'Price on request'}
                  </div>
                </article>
              ))}
              {!matches.length ? (
                <div className="text-sm text-zinc-600">
                  No inventory satisfies all hard requirement constraints.
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function VisitsPanel({
  contacts,
  projects,
  units,
  visits,
  busy,
  contactMap,
  projectMap,
  onVisit,
  onStatus,
}: {
  contacts: Contact[];
  projects: Project[];
  units: UnitRow[];
  visits: SiteVisit[];
  busy: boolean;
  contactMap: Map<string, string>;
  projectMap: Map<string, Project>;
  onVisit: (event: FormEvent<HTMLFormElement>) => void;
  onStatus: (id: string, status: string) => void;
}) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[400px_1fr]">
      <form onSubmit={onVisit} className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <h2 className="font-semibold">Schedule site visit</h2>
        <div className="mt-4 grid gap-3">
          <select className={field} name="contactId" defaultValue="" required>
            <option value="" disabled>Select contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>{contact.displayName}</option>
            ))}
          </select>
          <select className={field} name="projectId" defaultValue="">
            <option value="">No project / standalone property</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <select className={field} name="unitId" defaultValue="">
            <option value="">Project visit / no specific unit</option>
            {units
              .filter((row) => row.unit.inventoryStatus === 'AVAILABLE')
              .map((row) => (
                <option key={row.unit.id} value={row.unit.id}>{row.unit.title}</option>
              ))}
          </select>
          <input className={field} name="scheduledAt" type="datetime-local" required />
          <textarea
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50"
            name="notes"
            rows={3}
            placeholder="Visit notes"
          />
          <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60">
            Schedule
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <h2 className="font-semibold">Site visits</h2>
        <div className="mt-4 space-y-2">
          {visits.map((visit) => (
            <div key={visit.id} className="rounded-xl border border-white/[0.07] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">
                    {contactMap.get(visit.contactId) ?? 'Client'} ·{' '}
                    {visit.projectId
                      ? projectMap.get(visit.projectId)?.name ?? 'Project'
                      : 'Standalone property'}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {new Date(visit.scheduledAt).toLocaleString()}
                  </div>
                </div>
                <span className="text-xs text-emerald-300">{visit.status}</span>
              </div>
              {visit.status === 'SCHEDULED' ? (
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() => onStatus(visit.id, 'COMPLETED')}
                    className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-zinc-950"
                  >
                    Complete
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => onStatus(visit.id, 'NO_SHOW')}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400"
                  >
                    No show
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => onStatus(visit.id, 'CANCELLED')}
                    className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs text-red-300"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function BookingsPanel({
  contacts,
  units,
  bookings,
  busy,
  contactMap,
  unitMap,
  onBooking,
  onStatus,
}: {
  contacts: Contact[];
  units: UnitRow[];
  bookings: Booking[];
  busy: boolean;
  contactMap: Map<string, string>;
  unitMap: Map<string, UnitRow>;
  onBooking: (event: FormEvent<HTMLFormElement>) => void;
  onStatus: (id: string, status: string) => void;
}) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[400px_1fr]">
      <form onSubmit={onBooking} className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <h2 className="font-semibold">Reserve property</h2>
        <div className="mt-4 grid gap-3">
          <select className={field} name="contactId" defaultValue="" required>
            <option value="" disabled>Select contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>{contact.displayName}</option>
            ))}
          </select>
          <select className={field} name="unitId" defaultValue="" required>
            <option value="" disabled>Select available unit</option>
            {units
              .filter((row) => row.unit.inventoryStatus === 'AVAILABLE')
              .map((row) => (
                <option key={row.unit.id} value={row.unit.id}>{row.unit.title}</option>
              ))}
          </select>
          <input className={field} name="bookingAmount" inputMode="decimal" placeholder="Booking amount" />
          <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60">
            Reserve unit
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <h2 className="font-semibold">Bookings</h2>
        <div className="mt-4 space-y-2">
          {bookings.map((booking) => (
            <div key={booking.id} className="rounded-xl border border-white/[0.07] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">
                    {unitMap.get(booking.unitId)?.unit.title ?? 'Property'}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {contactMap.get(booking.contactId) ?? 'Client'} ·{' '}
                    {new Date(booking.bookedAt).toLocaleString()}
                  </div>
                  {booking.bookingAmount ? (
                    <div className="mt-2 text-sm text-zinc-300">
                      ₹{Number(booking.bookingAmount).toLocaleString('en-IN')}
                    </div>
                  ) : null}
                </div>
                <span className="text-xs text-emerald-300">{booking.status}</span>
              </div>
              {booking.status === 'RESERVED' ? (
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() => onStatus(booking.id, 'CONFIRMED')}
                    className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-zinc-950"
                  >
                    Confirm
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => onStatus(booking.id, 'CANCELLED')}
                    className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs text-red-300"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function splitCsv(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
