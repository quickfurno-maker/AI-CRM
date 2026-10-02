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

type SessionData = {
  organization: {
    branches: Array<{ id: string; name: string; timezone?: string }>;
    workspaces: Array<{ id: string; name: string }>;
  };
  capabilities: {
    entitlements: Array<{ key: string; enabled: boolean }>;
  };
};

type Dashboard = {
  date: string;
  employees: number;
  present: number;
  late: number;
  checkedIn: number;
  absent: number;
  onLeave: number;
  holiday: number;
  weekOff: number;
  notMarked: number;
  pendingLeaveApprovals: number;
};

type DepartmentRow = {
  department: {
    id: string;
    workspaceId: string;
    branchId?: string | null;
    name: string;
    code?: string | null;
    status: string;
  };
  branchName?: string | null;
};

type EmployeeRow = {
  employee: {
    id: string;
    workspaceId: string;
    branchId?: string | null;
    departmentId?: string | null;
    organizationMemberId?: string | null;
    employeeCode: string;
    displayName: string;
    email?: string | null;
    phone?: string | null;
    designation?: string | null;
    employmentType: string;
    status: string;
  };
  departmentName?: string | null;
  branchName?: string | null;
};

type ShiftRow = {
  shift: {
    id: string;
    branchId?: string | null;
    name: string;
    code: string;
    timezone: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    graceMinutes: number;
    expectedMinutes: number;
    weeklyOffDays: number[];
    isActive: boolean;
  };
  branchName?: string | null;
};

type RecordRow = {
  record: {
    id: string;
    employeeId: string;
    attendanceDate: string;
    status: string;
    firstCheckInAt?: string | null;
    lastCheckOutAt?: string | null;
    workMinutes: number;
    lateMinutes: number;
    earlyExitMinutes: number;
    overtimeMinutes: number;
  };
  employee: EmployeeRow['employee'];
  shiftName?: string | null;
  branchName?: string | null;
  departmentName?: string | null;
};

type LeaveRow = {
  leave: {
    id: string;
    employeeId: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    requestedDays: string;
    reason?: string | null;
    status: string;
  };
  employeeName: string;
  employeeCode: string;
};

type PolicyRow = {
  policy: {
    id: string;
    branchId?: string | null;
    name: string;
    isDefault: boolean;
    locationValidationMode: string;
    latitude?: string | null;
    longitude?: string | null;
    radiusMeters?: number | null;
    maxAccuracyMeters: number;
    allowRemote: boolean;
    lateGraceMinutes: number;
    earlyExitGraceMinutes: number;
    maxShiftHours: number;
    status: string;
  };
  branchName?: string | null;
};

type HolidayRow = {
  holiday: {
    id: string;
    branchId?: string | null;
    holidayDate: string;
    name: string;
    holidayType: string;
    isPaid: boolean;
  };
  branchName?: string | null;
};

type ReportResponse = {
  from: string;
  to: string;
  rows: Array<{
    employeeId: string;
    employeeCode: string;
    displayName: string;
    totalDays: number;
    presentDays: number;
    absentDays: number;
    leaveDays: number;
    holidayDays: number;
    weekOffDays: number;
    lateDays: number;
    workMinutes: number;
    overtimeMinutes: number;
  }>;
};

type Tab =
  | 'today'
  | 'people'
  | 'shifts'
  | 'leaves'
  | 'policies'
  | 'reports';

const field =
  'h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-cyan-400/50';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/attendance/' + path, {
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

function indiaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export default function AttendancePage() {
  const router = useRouter();
  const [enabled, setEnabled] = useState<boolean>();
  const [tab, setTab] = useState<Tab>('today');
  const [branches, setBranches] = useState<SessionData['organization']['branches']>([]);
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [report, setReport] = useState<ReportResponse>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const today = useMemo(() => indiaDate(), []);

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
      setBranches(session.organization.branches);
      const attendanceEnabled =
        session.capabilities.entitlements.find(
          (item) => item.key === 'extension.attendance',
        )?.enabled ?? false;
      setEnabled(attendanceEnabled);
      if (!attendanceEnabled) return;

      const result = await Promise.all([
        api<Dashboard>('dashboard?date=' + today),
        api<DepartmentRow[]>('departments?limit=200'),
        api<EmployeeRow[]>('employees?limit=200'),
        api<ShiftRow[]>('shifts?limit=200'),
        api<RecordRow[]>('records?date=' + today + '&limit=200'),
        api<LeaveRow[]>('leaves?limit=200'),
        api<PolicyRow[]>('policies?limit=200'),
        api<HolidayRow[]>('holidays?limit=200'),
      ]);
      setDashboard(result[0]);
      setDepartments(result[1]);
      setEmployees(result[2]);
      setShifts(result[3]);
      setRecords(result[4]);
      setLeaves(result[5]);
      setPolicies(result[6]);
      setHolidays(result[7]);
    } catch (reason) {
      if (reason instanceof Error && reason.message === 'AUTH') {
        router.replace('/login');
        return;
      }
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to load Attendance extension.',
      );
    }
  }, [router, today]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    path: string,
    build: (form: FormData) => Record<string, unknown>,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError('');
    try {
      const form = new FormData(formElement);
      await api(path, {
        method: 'POST',
        body: JSON.stringify(build(form)),
      });
      formElement.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }

  async function punch(employeeId: string, kind: 'check-in' | 'check-out') {
    setBusy(true);
    setError('');
    try {
      await api('employees/' + employeeId + '/' + kind, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Punch failed.');
    } finally {
      setBusy(false);
    }
  }

  async function decideLeave(id: string, status: 'APPROVED' | 'REJECTED') {
    setBusy(true);
    setError('');
    try {
      await api('leaves/' + id + '/decision', {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to decide leave.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function reconcile() {
    setBusy(true);
    setError('');
    try {
      await api('reconcile', {
        method: 'POST',
        body: JSON.stringify({ date: today }),
      });
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to reconcile day.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function runReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const from = String(form.get('from'));
      const to = String(form.get('to'));
      const rows = await api<ReportResponse>(
        'reports/summary?from=' + encodeURIComponent(from) +
          '&to=' + encodeURIComponent(to),
      );
      setReport(rows);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to load report.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (enabled === undefined) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#07090d] text-sm text-zinc-500">
        Loading Attendance extension…
      </main>
    );
  }

  if (!enabled) {
    return (
      <main className="min-h-screen bg-[#07090d] p-6 text-zinc-100">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-[#0d1017] p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
            Business OS Extension
          </div>
          <h1 className="mt-3 text-3xl font-semibold">
            Attendance & Employee Operations
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-500">
            This organization does not currently have the Attendance extension
            enabled. A platform administrator can activate it from Provider
            Extensions.
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
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
              Business OS
            </div>
            <div className="mt-2 text-lg font-semibold">Attendance</div>
            <div className="mt-1 text-xs text-zinc-600">Employee Operations · v1</div>
          </div>
          <nav className="space-y-1 text-sm">
            <Link href="/dashboard" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              Command Center
            </Link>
            <Link href="/crm" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              CRM
            </Link>
            <Link href="/real-estate" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              Real Estate
            </Link>
            <div className="rounded-xl bg-cyan-400/10 px-3 py-2.5 text-cyan-200">
              Attendance
            </div>
            <Link href="/automations" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">
              Automations
            </Link>
          </nav>
        </aside>

        <section className="min-w-0 p-4 sm:p-7 lg:p-9">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Employee Operations · {today}
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Attendance Control Center
              </h1>
              <p className="mt-2 text-sm text-zinc-500">
                Attendance is event-based. Location is checked only during a
                punch when the tenant enables location validation.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() => void reconcile()}
                className="rounded-xl border border-cyan-400/20 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-400/5 disabled:opacity-50"
              >
                Reconcile today
              </button>
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

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              ['Employees', dashboard?.employees ?? 0],
              ['Present', dashboard?.present ?? 0],
              ['Late', dashboard?.late ?? 0],
              ['Checked in', dashboard?.checkedIn ?? 0],
              ['On leave', dashboard?.onLeave ?? 0],
              ['Not marked', dashboard?.notMarked ?? 0],
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
            {(['today', 'people', 'shifts', 'leaves', 'policies', 'reports'] as Tab[]).map(
              (item) => (
                <button
                  key={item}
                  onClick={() => setTab(item)}
                  className={
                    'rounded-lg px-4 py-2 text-sm capitalize transition ' +
                    (tab === item
                      ? 'bg-cyan-400/10 text-cyan-200'
                      : 'text-zinc-500 hover:text-zinc-300')
                  }
                >
                  {item}
                </button>
              ),
            )}
          </div>

          {tab === 'today' ? (
            <TodayPanel
              records={records}
              employees={employees}
              busy={busy}
              onPunch={(id, kind) => void punch(id, kind)}
            />
          ) : null}

          {tab === 'people' ? (
            <PeoplePanel
              branches={branches}
              departments={departments}
              employees={employees}
              busy={busy}
              onDepartment={(event) =>
                void submit(event, 'departments', (form) => ({
                  name: form.get('name'),
                  code: form.get('code') || undefined,
                  branchId: form.get('branchId') || undefined,
                }))
              }
              onEmployee={(event) =>
                void submit(event, 'employees', (form) => ({
                  employeeCode: form.get('employeeCode'),
                  displayName: form.get('displayName'),
                  email: form.get('email') || undefined,
                  phone: form.get('phone') || undefined,
                  designation: form.get('designation') || undefined,
                  branchId: form.get('branchId') || undefined,
                  departmentId: form.get('departmentId') || undefined,
                  employmentType: form.get('employmentType'),
                }))
              }
            />
          ) : null}

          {tab === 'shifts' ? (
            <ShiftsPanel
              branches={branches}
              employees={employees}
              shifts={shifts}
              busy={busy}
              onShift={(event) =>
                void submit(event, 'shifts', (form) => ({
                  name: form.get('name'),
                  code: form.get('code'),
                  branchId: form.get('branchId') || undefined,
                  startTime: form.get('startTime'),
                  endTime: form.get('endTime'),
                  breakMinutes: Number(form.get('breakMinutes') || 0),
                  graceMinutes: Number(form.get('graceMinutes') || 0),
                  weeklyOffDays: form
                    .getAll('weeklyOffDays')
                    .map((value) => Number(value)),
                }))
              }
              onAssignment={(event) =>
                void submit(event, 'shift-assignments', (form) => ({
                  employeeId: form.get('employeeId'),
                  shiftId: form.get('shiftId'),
                  effectiveFrom: form.get('effectiveFrom'),
                  effectiveTo: form.get('effectiveTo') || undefined,
                }))
              }
            />
          ) : null}

          {tab === 'leaves' ? (
            <LeavesPanel
              employees={employees}
              leaves={leaves}
              busy={busy}
              onLeave={(event) => {
                const form = new FormData(event.currentTarget);
                const employeeId = String(form.get('employeeId'));
                void submit(
                  event,
                  'employees/' + employeeId + '/leaves',
                  (requestForm) => ({
                    leaveType: requestForm.get('leaveType'),
                    startDate: requestForm.get('startDate'),
                    endDate: requestForm.get('endDate'),
                    requestedDays:
                      requestForm.get('requestedDays') || undefined,
                    reason: requestForm.get('reason') || undefined,
                  }),
                );
              }}
              onDecision={(id, status) => void decideLeave(id, status)}
            />
          ) : null}

          {tab === 'policies' ? (
            <PoliciesPanel
              branches={branches}
              policies={policies}
              holidays={holidays}
              busy={busy}
              onPolicy={(event) =>
                void submit(event, 'policies', (form) => ({
                  name: form.get('name'),
                  branchId: form.get('branchId') || undefined,
                  isDefault: form.get('isDefault') === 'on',
                  locationValidationMode: form.get('locationValidationMode'),
                  latitude: form.get('latitude') || undefined,
                  longitude: form.get('longitude') || undefined,
                  radiusMeters: form.get('radiusMeters')
                    ? Number(form.get('radiusMeters'))
                    : undefined,
                  maxAccuracyMeters: Number(
                    form.get('maxAccuracyMeters') || 100,
                  ),
                  allowRemote: form.get('allowRemote') === 'on',
                  lateGraceMinutes: Number(
                    form.get('lateGraceMinutes') || 0,
                  ),
                  earlyExitGraceMinutes: Number(
                    form.get('earlyExitGraceMinutes') || 0,
                  ),
                  maxShiftHours: Number(form.get('maxShiftHours') || 16),
                }))
              }
              onHoliday={(event) =>
                void submit(event, 'holidays', (form) => ({
                  holidayDate: form.get('holidayDate'),
                  name: form.get('holidayName'),
                  branchId: form.get('holidayBranchId') || undefined,
                  holidayType: form.get('holidayType'),
                  isPaid: form.get('isPaid') === 'on',
                }))
              }
            />
          ) : null}

          {tab === 'reports' ? (
            <ReportsPanel
              today={today}
              report={report}
              busy={busy}
              onReport={(event) => void runReport(event)}
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function TodayPanel({
  records,
  employees,
  busy,
  onPunch,
}: {
  records: RecordRow[];
  employees: EmployeeRow[];
  busy: boolean;
  onPunch: (id: string, kind: 'check-in' | 'check-out') => void;
}) {
  const recordMap = new Map(records.map((row) => [row.record.employeeId, row]));
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1017]">
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="font-semibold">Today&apos;s attendance</h2>
      </div>
      <div className="divide-y divide-white/[0.06]">
        {employees
          .filter((row) => row.employee.status === 'ACTIVE')
          .map((row) => {
            const attendance = recordMap.get(row.employee.id);
            const record = attendance?.record;
            return (
              <div
                key={row.employee.id}
                className="grid gap-3 px-5 py-4 lg:grid-cols-[1.2fr_.7fr_.7fr_.7fr_1fr]"
              >
                <div>
                  <div className="font-medium">{row.employee.displayName}</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {row.employee.employeeCode} ·{' '}
                    {row.departmentName ?? 'No department'} ·{' '}
                    {row.branchName ?? 'No branch'}
                  </div>
                </div>
                <div className="text-sm text-zinc-400">
                  {record?.status ?? 'NOT_MARKED'}
                </div>
                <div className="text-xs text-zinc-500">
                  In:{' '}
                  {record?.firstCheckInAt
                    ? new Date(record.firstCheckInAt).toLocaleTimeString()
                    : '—'}
                </div>
                <div className="text-xs text-zinc-500">
                  Out:{' '}
                  {record?.lastCheckOutAt
                    ? new Date(record.lastCheckOutAt).toLocaleTimeString()
                    : '—'}
                </div>
                <div className="flex gap-2 lg:justify-end">
                  {!record?.firstCheckInAt ? (
                    <button
                      disabled={busy}
                      onClick={() => onPunch(row.employee.id, 'check-in')}
                      className="rounded-lg bg-cyan-300 px-3 py-1.5 text-xs font-semibold text-zinc-950 disabled:opacity-50"
                    >
                      Check in
                    </button>
                  ) : !record.lastCheckOutAt ? (
                    <button
                      disabled={busy}
                      onClick={() => onPunch(row.employee.id, 'check-out')}
                      className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-950 disabled:opacity-50"
                    >
                      Check out
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-600">
                      {Math.floor(record.workMinutes / 60)}h{' '}
                      {record.workMinutes % 60}m
                    </span>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}

function PeoplePanel({
  branches,
  departments,
  employees,
  busy,
  onDepartment,
  onEmployee,
}: {
  branches: SessionData['organization']['branches'];
  departments: DepartmentRow[];
  employees: EmployeeRow[];
  busy: boolean;
  onDepartment: (event: FormEvent<HTMLFormElement>) => void;
  onEmployee: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="mt-6 space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={onDepartment} className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <h2 className="font-semibold">Add department</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input className={field} name="name" placeholder="Department name" required />
            <input className={field} name="code" placeholder="Code" />
            <select className={field} name="branchId" defaultValue="">
              <option value="">All / no branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-50">
              Add department
            </button>
          </div>
        </form>

        <form onSubmit={onEmployee} className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <h2 className="font-semibold">Add employee</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input className={field} name="employeeCode" placeholder="Employee code" required />
            <input className={field} name="displayName" placeholder="Full name" required />
            <input className={field} name="email" type="email" placeholder="Email" />
            <input className={field} name="phone" placeholder="Phone" />
            <input className={field} name="designation" placeholder="Designation" />
            <select className={field} name="employmentType" defaultValue="FULL_TIME">
              <option>FULL_TIME</option>
              <option>PART_TIME</option>
              <option>CONTRACT</option>
              <option>INTERN</option>
              <option>CONSULTANT</option>
            </select>
            <select className={field} name="branchId" defaultValue="">
              <option value="">No branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <select className={field} name="departmentId" defaultValue="">
              <option value="">No department</option>
              {departments.map((row) => (
                <option key={row.department.id} value={row.department.id}>
                  {row.department.name}
                </option>
              ))}
            </select>
            <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-50 sm:col-span-2">
              Add employee
            </button>
          </div>
        </form>
      </div>

      <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <h2 className="font-semibold">Employees</h2>
        <div className="mt-4 divide-y divide-white/[0.06]">
          {employees.map((row) => (
            <div key={row.employee.id} className="grid gap-2 py-3 md:grid-cols-[1.2fr_.8fr_.8fr_.7fr]">
              <div>
                <div className="font-medium">{row.employee.displayName}</div>
                <div className="text-xs text-zinc-600">{row.employee.employeeCode}</div>
              </div>
              <div className="text-sm text-zinc-500">{row.departmentName ?? '—'}</div>
              <div className="text-sm text-zinc-500">{row.branchName ?? '—'}</div>
              <div className="text-xs text-zinc-500">{row.employee.status}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ShiftsPanel({
  branches,
  employees,
  shifts,
  busy,
  onShift,
  onAssignment,
}: {
  branches: SessionData['organization']['branches'];
  employees: EmployeeRow[];
  shifts: ShiftRow[];
  busy: boolean;
  onShift: (event: FormEvent<HTMLFormElement>) => void;
  onAssignment: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="mt-6 space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={onShift} className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <h2 className="font-semibold">Create shift</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input className={field} name="name" placeholder="General shift" required />
            <input className={field} name="code" placeholder="GEN" required />
            <select className={field} name="branchId" defaultValue="">
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input className={field} name="startTime" type="time" required />
              <input className={field} name="endTime" type="time" required />
            </div>
            <input className={field} name="breakMinutes" type="number" min="0" placeholder="Break minutes" />
            <input className={field} name="graceMinutes" type="number" min="0" placeholder="Grace minutes" />
            <div className="sm:col-span-2">
              <div className="mb-2 text-xs text-zinc-600">Weekly off</div>
              <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, index) => (
                  <label key={day} className="flex items-center gap-1.5">
                    <input name="weeklyOffDays" type="checkbox" value={index} />
                    {day}
                  </label>
                ))}
              </div>
            </div>
            <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-50 sm:col-span-2">
              Create shift
            </button>
          </div>
        </form>

        <form onSubmit={onAssignment} className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <h2 className="font-semibold">Assign shift</h2>
          <div className="mt-4 grid gap-3">
            <select className={field} name="employeeId" defaultValue="" required>
              <option value="" disabled>Select employee</option>
              {employees.filter((row) => row.employee.status === 'ACTIVE').map((row) => (
                <option key={row.employee.id} value={row.employee.id}>{row.employee.displayName}</option>
              ))}
            </select>
            <select className={field} name="shiftId" defaultValue="" required>
              <option value="" disabled>Select shift</option>
              {shifts.filter((row) => row.shift.isActive).map((row) => (
                <option key={row.shift.id} value={row.shift.id}>{row.shift.name}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input className={field} name="effectiveFrom" type="date" required />
              <input className={field} name="effectiveTo" type="date" />
            </div>
            <button disabled={busy} className="h-10 rounded-xl bg-cyan-300 text-sm font-semibold text-zinc-950 disabled:opacity-50">
              Assign shift
            </button>
          </div>
        </form>
      </div>

      <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <h2 className="font-semibold">Shifts</h2>
        <div className="mt-4 divide-y divide-white/[0.06]">
          {shifts.map((row) => (
            <div key={row.shift.id} className="grid gap-2 py-3 md:grid-cols-[1fr_.7fr_.7fr_.8fr]">
              <div className="font-medium">{row.shift.name}</div>
              <div className="text-sm text-zinc-500">{row.shift.startTime}–{row.shift.endTime}</div>
              <div className="text-sm text-zinc-500">{row.branchName ?? 'All branches'}</div>
              <div className="text-xs text-zinc-600">
                {row.shift.expectedMinutes} min · grace {row.shift.graceMinutes} min
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function LeavesPanel({
  employees,
  leaves,
  busy,
  onLeave,
  onDecision,
}: {
  employees: EmployeeRow[];
  leaves: LeaveRow[];
  busy: boolean;
  onLeave: (event: FormEvent<HTMLFormElement>) => void;
  onDecision: (id: string, status: 'APPROVED' | 'REJECTED') => void;
}) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[380px_1fr]">
      <form onSubmit={onLeave} className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <h2 className="font-semibold">Create leave request</h2>
        <div className="mt-4 grid gap-3">
          <select className={field} name="employeeId" defaultValue="" required>
            <option value="" disabled>Select employee</option>
            {employees.filter((row) => row.employee.status === 'ACTIVE').map((row) => (
              <option key={row.employee.id} value={row.employee.id}>{row.employee.displayName}</option>
            ))}
          </select>
          <input className={field} name="leaveType" placeholder="Leave type" required />
          <div className="grid grid-cols-2 gap-3">
            <input className={field} name="startDate" type="date" required />
            <input className={field} name="endDate" type="date" required />
          </div>
          <input className={field} name="requestedDays" inputMode="decimal" placeholder="Days (optional)" />
          <textarea
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none"
            name="reason"
            rows={3}
            placeholder="Reason"
          />
          <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-50">
            Create request
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Leave approvals</h2>
          <span className="text-xs text-zinc-600">
            Pending {leaves.filter((row) => row.leave.status === 'PENDING').length}
          </span>
        </div>
        <div className="mt-4 space-y-2">
          {leaves.map((row) => (
            <div key={row.leave.id} className="rounded-xl border border-white/[0.07] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{row.employeeName}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {row.leave.leaveType} · {row.leave.startDate} → {row.leave.endDate} · {row.leave.requestedDays} day(s)
                  </div>
                </div>
                <span className="text-xs text-cyan-300">{row.leave.status}</span>
              </div>
              {row.leave.reason ? (
                <p className="mt-3 text-xs leading-5 text-zinc-500">{row.leave.reason}</p>
              ) : null}
              {row.leave.status === 'PENDING' ? (
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() => onDecision(row.leave.id, 'APPROVED')}
                    className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-zinc-950"
                  >
                    Approve
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => onDecision(row.leave.id, 'REJECTED')}
                    className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs text-red-300"
                  >
                    Reject
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

function PoliciesPanel({
  branches,
  policies,
  holidays,
  busy,
  onPolicy,
  onHoliday,
}: {
  branches: SessionData['organization']['branches'];
  policies: PolicyRow[];
  holidays: HolidayRow[];
  busy: boolean;
  onPolicy: (event: FormEvent<HTMLFormElement>) => void;
  onHoliday: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="mt-6 space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={onPolicy} className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <h2 className="font-semibold">Attendance policy</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input className={field} name="name" placeholder="Default policy" required />
            <select className={field} name="branchId" defaultValue="">
              <option value="">Workspace default</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <select className={field} name="locationValidationMode" defaultValue="NONE">
              <option>NONE</option>
              <option>OPTIONAL</option>
              <option>REQUIRED</option>
            </select>
            <input className={field} name="radiusMeters" type="number" min="10" placeholder="Radius metres" />
            <input className={field} name="maxAccuracyMeters" type="number" min="10" max="5000" defaultValue="100" placeholder="Max GPS accuracy metres" />
            <input className={field} name="latitude" inputMode="decimal" placeholder="Branch latitude" />
            <input className={field} name="longitude" inputMode="decimal" placeholder="Branch longitude" />
            <input className={field} name="lateGraceMinutes" type="number" min="0" placeholder="Late grace min" />
            <input className={field} name="earlyExitGraceMinutes" type="number" min="0" placeholder="Early exit grace min" />
            <input className={field} name="maxShiftHours" type="number" min="1" max="36" defaultValue="16" />
            <div className="flex items-center gap-4 text-xs text-zinc-400">
              <label className="flex items-center gap-2">
                <input name="isDefault" type="checkbox" />
                Default
              </label>
              <label className="flex items-center gap-2">
                <input name="allowRemote" type="checkbox" />
                Allow remote punch
              </label>
            </div>
            <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-50 sm:col-span-2">
              Save policy
            </button>
          </div>
        </form>

        <form onSubmit={onHoliday} className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <h2 className="font-semibold">Add holiday</h2>
          <div className="mt-4 grid gap-3">
            <input className={field} name="holidayName" placeholder="Holiday name" required />
            <input className={field} name="holidayDate" type="date" required />
            <select className={field} name="holidayBranchId" defaultValue="">
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <select className={field} name="holidayType" defaultValue="COMPANY">
              <option>COMPANY</option>
              <option>PUBLIC</option>
              <option>OPTIONAL</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input name="isPaid" type="checkbox" defaultChecked />
              Paid holiday
            </label>
            <button disabled={busy} className="h-10 rounded-xl bg-cyan-300 text-sm font-semibold text-zinc-950 disabled:opacity-50">
              Add holiday
            </button>
          </div>
        </form>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <h2 className="font-semibold">Policies</h2>
          <div className="mt-4 space-y-2">
            {policies.map((row) => (
              <div key={row.policy.id} className="rounded-xl border border-white/[0.07] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{row.policy.name}</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {row.branchName ?? 'Workspace default'} · {row.policy.locationValidationMode}
                      {row.policy.radiusMeters ? ' · radius ' + row.policy.radiusMeters + 'm' : ''}
                      {row.policy.locationValidationMode !== 'NONE'
                        ? ' · accuracy ≤ ' + row.policy.maxAccuracyMeters + 'm'
                        : ''}
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500">{row.policy.status}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <h2 className="font-semibold">Holiday calendar</h2>
          <div className="mt-4 space-y-2">
            {holidays.map((row) => (
              <div key={row.holiday.id} className="flex items-center justify-between rounded-xl border border-white/[0.07] p-4">
                <div>
                  <div className="font-medium">{row.holiday.name}</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {row.holiday.holidayDate} · {row.branchName ?? 'All branches'}
                  </div>
                </div>
                <span className="text-xs text-zinc-500">{row.holiday.holidayType}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function ReportsPanel({
  today,
  report,
  busy,
  onReport,
}: {
  today: string;
  report?: ReportResponse;
  busy: boolean;
  onReport: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="mt-6 space-y-5">
      <form onSubmit={onReport} className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <h2 className="font-semibold">Attendance summary</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <input className={field} name="from" type="date" defaultValue={today.slice(0, 8) + '01'} required />
          <input className={field} name="to" type="date" defaultValue={today} required />
          <button disabled={busy} className="h-10 rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950 disabled:opacity-50">
            Run report
          </button>
        </div>
      </form>

      {report ? (
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1017]">
          <div className="border-b border-white/10 px-5 py-4 text-sm text-zinc-400">
            {report.from} → {report.to}
          </div>
          <div className="divide-y divide-white/[0.06]">
            {report.rows.map((row) => (
              <div key={row.employeeId} className="grid gap-2 px-5 py-4 lg:grid-cols-[1.2fr_repeat(5,.6fr)]">
                <div>
                  <div className="font-medium">{row.displayName}</div>
                  <div className="text-xs text-zinc-600">{row.employeeCode}</div>
                </div>
                <Metric label="Present" value={row.presentDays} />
                <Metric label="Absent" value={row.absentDays} />
                <Metric label="Leave" value={row.leaveDays} />
                <Metric label="Late" value={row.lateDays} />
                <Metric label="Hours" value={(row.workMinutes / 60).toFixed(1)} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">{label}</div>
      <div className="mt-1 text-sm text-zinc-300">{value}</div>
    </div>
  );
}
