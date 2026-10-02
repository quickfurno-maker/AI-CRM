'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type SessionData = {
  organization: {
    organization: { name: string; slug: string };
    workspaces: Array<{ id: string; name: string }>;
    branches: Array<{ id: string; name: string }>;
  };
};

type StaffRow = {
  id: string;
  workspaceId: string;
  branchId?: string | null;
  organizationMemberId?: string | null;
  employeeCode: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  designation?: string | null;
  department?: string | null;
  employmentType: string;
  status: string;
  login: {
    membershipId: string;
    membershipStatus: string | null;
  } | null;
  seat: {
    accessClass: AccessClass;
    status: string;
    consumesFullSeat: boolean;
  } | null;
};

type AccessClass = 'FULL' | 'LIGHT' | 'ATTENDANCE_ONLY' | 'GUEST';

type MemberRow = {
  membershipId: string;
  membershipStatus: string;
  isOwner: boolean;
  userId: string;
  displayName: string;
  email: string;
  staffProfileId?: string | null;
  employeeCode?: string | null;
  seat: {
    id: string;
    accessClass: AccessClass;
    status: string;
    consumesFullSeat: boolean;
  } | null;
};

type SeatSummary = {
  commercialRule: string;
  staffRecords: {
    total: number;
    active: number;
    billableByCreation: boolean;
  };
  seats: {
    usage: Record<AccessClass, number>;
    limits: Record<AccessClass, number | null>;
  };
};

const field =
  'h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-violet-400/50';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/staff/' + path, {
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

function limitLabel(value: number | null) {
  return value === null ? 'Unlimited' : String(value);
}

export default function StaffPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData>();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [summary, setSummary] = useState<SeatSummary>();
  const [seatDrafts, setSeatDrafts] = useState<Record<string, AccessClass>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const sessionResponse = await fetch('/api/session', { cache: 'no-store' });
      if (sessionResponse.status === 401) {
        router.replace('/login');
        return;
      }
      if (!sessionResponse.ok) throw new Error('Unable to load tenant session.');
      const nextSession = (await sessionResponse.json()) as SessionData;

      const [staffRows, memberRows, seatSummary] = await Promise.all([
        api<StaffRow[]>('profiles?limit=500'),
        api<MemberRow[]>('members/directory'),
        api<SeatSummary>('seats/summary'),
      ]);

      setSession(nextSession);
      setStaff(staffRows);
      setMembers(memberRows);
      setSummary(seatSummary);
      setSeatDrafts(
        Object.fromEntries(
          memberRows.map((member) => [
            member.membershipId,
            member.seat?.accessClass ?? 'FULL',
          ]),
        ) as Record<string, AccessClass>,
      );
    } catch (reason) {
      if (reason instanceof Error && reason.message === 'AUTH') {
        router.replace('/login');
        return;
      }
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to load Staff & Access.',
      );
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const unlinkedMembers = useMemo(
    () => members.filter((member) => !member.staffProfileId),
    [members],
  );

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError('');
    try {
      await api('profiles', {
        method: 'POST',
        body: JSON.stringify({
          employeeCode: form.get('employeeCode'),
          displayName: form.get('displayName'),
          email: form.get('email') || undefined,
          phone: form.get('phone') || undefined,
          designation: form.get('designation') || undefined,
          department: form.get('department') || undefined,
          branchId: form.get('branchId') || undefined,
          organizationMemberId: form.get('organizationMemberId') || undefined,
          employmentType: form.get('employmentType'),
          joiningDate: form.get('joiningDate') || undefined,
        }),
      });
      formElement.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create staff.');
    } finally {
      setBusy(false);
    }
  }

  async function assignSeat(member: MemberRow) {
    setBusy(true);
    setError('');
    try {
      await api('members/' + member.membershipId + '/seat', {
        method: 'PUT',
        body: JSON.stringify({
          accessClass: seatDrafts[member.membershipId] ?? 'FULL',
        }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to assign seat.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeSeat(member: MemberRow) {
    setBusy(true);
    setError('');
    try {
      await api('members/' + member.membershipId + '/seat', {
        method: 'DELETE',
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to revoke seat.');
    } finally {
      setBusy(false);
    }
  }

  if (!session || !summary) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#07090d] text-sm text-zinc-500">
        Loading Staff & Access…
      </main>
    );
  }

  const fullLimit = summary.seats.limits.FULL;
  const fullUsage = summary.seats.usage.FULL;

  return (
    <main className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto grid min-h-screen max-w-[1800px] lg:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-white/10 bg-[#0b0e14] p-5 lg:block">
          <div className="mb-8 px-2">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
              Business OS
            </div>
            <div className="mt-2 truncate text-lg font-semibold">
              {session.organization.organization.name}
            </div>
            <div className="mt-1 text-xs text-zinc-600">
              Staff & Access
            </div>
          </div>
          <nav className="space-y-1 text-sm">
            <Link href="/dashboard" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              Command Center
            </Link>
            <Link href="/crm" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              CRM
            </Link>
            <div className="rounded-xl bg-violet-400/10 px-3 py-2.5 text-violet-200">
              Staff & Access
            </div>
            <Link href="/attendance" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              Attendance
            </Link>
            <Link href="/billing" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              Billing
            </Link>
          </nav>
        </aside>

        <section className="min-w-0 p-4 sm:p-7 lg:p-9">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-violet-300">
                People are not seats
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Staff & Access Control
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
                Create your complete workforce directory freely. Product billing is
                driven only by explicit seat assignments to login memberships.
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
            <MetricCard label="Staff records" value={summary.staffRecords.total} detail="Not billable by creation" />
            <MetricCard
              label="Full seats"
              value={fullUsage}
              detail={fullUsage + ' / ' + limitLabel(fullLimit)}
            />
            <MetricCard
              label="Light seats"
              value={summary.seats.usage.LIGHT}
              detail={'Limit ' + limitLabel(summary.seats.limits.LIGHT)}
            />
            <MetricCard
              label="Attendance only"
              value={summary.seats.usage.ATTENDANCE_ONLY}
              detail={'Limit ' + limitLabel(summary.seats.limits.ATTENDANCE_ONLY)}
            />
            <MetricCard
              label="Guest"
              value={summary.seats.usage.GUEST}
              detail={'Limit ' + limitLabel(summary.seats.limits.GUEST)}
            />
          </div>

          <div className="mt-5 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] p-4 text-sm text-emerald-100">
            {summary.commercialRule}
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-[.75fr_1.25fr]">
            <form onSubmit={createStaff} className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5">
              <h2 className="font-semibold">Create staff profile</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-600">
                This action creates a person record only. It does not create a paid seat.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input className={field} name="employeeCode" placeholder="Employee code" required />
                <input className={field} name="displayName" placeholder="Full name" required />
                <input className={field} name="email" type="email" placeholder="Email" />
                <input className={field} name="phone" placeholder="Phone" />
                <input className={field} name="designation" placeholder="Designation" />
                <input className={field} name="department" placeholder="Department" />
                <select className={field} name="employmentType" defaultValue="FULL_TIME">
                  <option value="FULL_TIME">Full time</option>
                  <option value="PART_TIME">Part time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="INTERN">Intern</option>
                  <option value="CONSULTANT">Consultant</option>
                </select>
                <select className={field} name="branchId" defaultValue="">
                  <option value="">No branch</option>
                  {session.organization.branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
                <input className={field} name="joiningDate" type="date" />
                <select className={field} name="organizationMemberId" defaultValue="">
                  <option value="">No login account</option>
                  {unlinkedMembers.map((member) => (
                    <option key={member.membershipId} value={member.membershipId}>
                      {member.displayName} · {member.email}
                    </option>
                  ))}
                </select>
                <button
                  disabled={busy}
                  className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-50 sm:col-span-2"
                >
                  Create staff — no paid seat
                </button>
              </div>
            </form>

            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1017]">
              <div className="border-b border-white/10 px-5 py-4">
                <h2 className="font-semibold">Staff directory</h2>
                <p className="mt-1 text-xs text-zinc-600">
                  Login and seat are shown separately from employment status.
                </p>
              </div>
              <div className="divide-y divide-white/[0.06]">
                {staff.length ? staff.map((person) => (
                  <div key={person.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1.4fr_.8fr_.8fr] lg:items-center">
                    <div>
                      <div className="font-medium">{person.displayName}</div>
                      <div className="mt-1 text-xs text-zinc-600">
                        {person.employeeCode}
                        {person.designation ? ' · ' + person.designation : ''}
                        {person.department ? ' · ' + person.department : ''}
                      </div>
                    </div>
                    <div className="text-xs">
                      <div className="text-zinc-500">Login</div>
                      <div className={person.login ? 'mt-1 text-emerald-300' : 'mt-1 text-zinc-600'}>
                        {person.login ? person.login.membershipStatus : 'No login'}
                      </div>
                    </div>
                    <div className="text-xs">
                      <div className="text-zinc-500">Seat</div>
                      <div className={person.seat ? 'mt-1 text-violet-200' : 'mt-1 text-zinc-600'}>
                        {person.seat?.accessClass ?? 'None'}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="px-5 py-10 text-center text-sm text-zinc-600">
                    No staff profiles yet.
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1017]">
            <div className="border-b border-white/10 px-5 py-4">
              <h2 className="font-semibold">Login members & product seats</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-600">
                Seat assignment is an explicit commercial action. Revoking a seat never deletes the staff profile.
              </p>
            </div>
            <div className="divide-y divide-white/[0.06]">
              {members.map((member) => (
                <div key={member.membershipId} className="grid gap-4 px-5 py-4 xl:grid-cols-[1.2fr_.7fr_.8fr_auto] xl:items-center">
                  <div>
                    <div className="font-medium">
                      {member.displayName}
                      {member.isOwner ? <span className="ml-2 text-xs text-amber-300">Owner</span> : null}
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {member.email}
                      {member.employeeCode ? ' · ' + member.employeeCode : ' · not linked to staff'}
                    </div>
                  </div>
                  <div className="text-xs">
                    <div className="text-zinc-500">Current seat</div>
                    <div className="mt-1 text-violet-200">{member.seat?.accessClass ?? 'None'}</div>
                  </div>
                  <select
                    className={field}
                    value={seatDrafts[member.membershipId] ?? 'FULL'}
                    onChange={(event) =>
                      setSeatDrafts((current) => ({
                        ...current,
                        [member.membershipId]: event.target.value as AccessClass,
                      }))
                    }
                  >
                    <option value="FULL">Full workspace</option>
                    <option value="LIGHT">Light</option>
                    <option value="ATTENDANCE_ONLY">Attendance only</option>
                    <option value="GUEST">Guest</option>
                  </select>
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => void assignSeat(member)}
                      className="rounded-xl bg-violet-300 px-3 py-2 text-xs font-semibold text-zinc-950 disabled:opacity-50"
                    >
                      Assign
                    </button>
                    <button
                      disabled={busy || member.isOwner || !member.seat}
                      onClick={() => void revokeSeat(member)}
                      className="rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300 disabled:opacity-30"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-zinc-600">{detail}</div>
    </article>
  );
}
