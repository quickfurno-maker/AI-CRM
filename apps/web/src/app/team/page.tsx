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
    organization: { name: string };
    workspaces: Array<{ id: string; name: string }>;
    branches: Array<{ id: string; name: string }>;
  };
};

type Role = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  permissions: Array<{
    permissionKey: string;
    scope: Scope;
  }>;
};

type Team = {
  id: string;
  name: string;
  workspaceId: string;
  branchId?: string | null;
  memberIds: string[];
};

type Member = {
  membershipId: string;
  status: string;
  isOwner: boolean;
  joinedAt: string;
  email: string;
  displayName: string;
  seat?: { accessClass: string; status: string } | null;
  roles: Array<{ roleId: string; roleKey: string; roleName: string }>;
  teams: Array<{ teamId: string; teamName: string }>;
};

type Invitation = {
  id: string;
  email: string;
  seatClass: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};

type Permission = {
  id: string;
  key: string;
  description?: string | null;
};

type Scope = 'OWN' | 'TEAM' | 'BRANCH' | 'WORKSPACE' | 'ORGANIZATION';

const scopes: Scope[] = ['OWN', 'TEAM', 'BRANCH', 'WORKSPACE', 'ORGANIZATION'];
const field =
  'h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-violet-400/50';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/team-admin/' + path, {
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

export default function TeamPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData>();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [rolePermissionKey, setRolePermissionKey] = useState('');
  const [roleScope, setRoleScope] = useState<Scope>('WORKSPACE');

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
      const [memberRows, invitationRows, roleRows, teamRows, permissionRows] =
        await Promise.all([
          api<Member[]>('members'),
          api<Invitation[]>('invitations'),
          api<Role[]>('roles'),
          api<Team[]>('teams'),
          api<Permission[]>('permissions'),
        ]);
      setSession(nextSession);
      setMembers(memberRows);
      setInvitations(invitationRows);
      setRoles(roleRows);
      setTeams(teamRows);
      setPermissions(permissionRows);
      if (!rolePermissionKey && permissionRows[0]) {
        setRolePermissionKey(permissionRows[0].key);
      }
    } catch (reason) {
      if (reason instanceof Error && reason.message === 'AUTH') {
        router.replace('/login');
        return;
      }
      setError(reason instanceof Error ? reason.message : 'Unable to load team admin.');
    }
  }, [rolePermissionKey, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const pendingInvites = useMemo(
    () => invitations.filter((item) => item.status === 'PENDING'),
    [invitations],
  );

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy('invite');
    setError('');
    setNotice('');
    try {
      const response = await api<{
        acceptanceToken: string;
        deliveryStatus: string;
      }>('invitations', {
        method: 'POST',
        body: JSON.stringify({
          email: data.get('email'),
          seatClass: data.get('seatClass'),
          workspaceId: data.get('workspaceId') || undefined,
          branchId: data.get('branchId') || undefined,
          expiresInHours: 72,
        }),
      });
      setNotice(
        response.deliveryStatus === 'EXTERNAL_EMAIL_PROVIDER_PENDING'
          ? 'Invitation created. Email delivery provider is not activated yet; token is available to an administrator for controlled testing.'
          : 'Invitation created.',
      );
      form.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create invitation.');
    } finally {
      setBusy('');
    }
  }

  async function invitationAction(id: string, action: 'resend' | 'cancel') {
    setBusy(id + action);
    setError('');
    setNotice('');
    try {
      await api('invitations/' + id + '/' + action, { method: 'POST' });
      setNotice(action === 'resend' ? 'Invitation token rotated.' : 'Invitation cancelled.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update invitation.');
    } finally {
      setBusy('');
    }
  }

  async function toggleMember(member: Member) {
    if (member.isOwner) return;
    const next = member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setBusy(member.membershipId + 'status');
    setError('');
    try {
      await api('members/' + member.membershipId + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update member.');
    } finally {
      setBusy('');
    }
  }

  async function updateMemberRoles(
    member: Member,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (member.isOwner) return;
    const form = new FormData(event.currentTarget);
    const roleIds = form.getAll('roleId').map(String);
    setBusy(member.membershipId + 'roles');
    setError('');
    try {
      await api('members/' + member.membershipId + '/roles', {
        method: 'PUT',
        body: JSON.stringify({ roleIds }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update roles.');
    } finally {
      setBusy('');
    }
  }

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy('role');
    setError('');
    try {
      await api('roles', {
        method: 'POST',
        body: JSON.stringify({
          key: data.get('key'),
          name: data.get('name'),
          description: data.get('description') || undefined,
          permissions: rolePermissionKey
            ? [{ key: rolePermissionKey, scope: roleScope }]
            : [],
        }),
      });
      form.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create role.');
    } finally {
      setBusy('');
    }
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy('team');
    setError('');
    try {
      await api('teams', {
        method: 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          workspaceId: data.get('workspaceId') || undefined,
          branchId: data.get('branchId') || undefined,
        }),
      });
      form.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create team.');
    } finally {
      setBusy('');
    }
  }

  async function updateTeamMembers(team: Team, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(team.id + 'members');
    setError('');
    try {
      await api('teams/' + team.id + '/members', {
        method: 'PUT',
        body: JSON.stringify({
          memberIds: data.getAll('memberId').map(String),
        }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update team.');
    } finally {
      setBusy('');
    }
  }

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#07090d] text-sm text-zinc-500">
        Loading Team & Access…
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto max-w-[1700px] p-4 sm:p-7 lg:p-9">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
              Identity · RBAC · Scope
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Team & Access</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Invite users, suspend access, assign scoped roles, and group members into teams.
              Staff records and paid product seats remain separate concerns.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/staff" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300">
              Staff & Seats
            </Link>
            <Link href="/dashboard" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300">
              Command Center
            </Link>
          </div>
        </header>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {notice}
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Members" value={members.length} detail={members.filter((m) => m.status === 'ACTIVE').length + ' active'} />
          <Metric label="Pending invites" value={pendingInvites.length} detail="72-hour default expiry" />
          <Metric label="Roles" value={roles.length} detail="Scoped permission bundles" />
          <Metric label="Teams" value={teams.length} detail="Used by TEAM scope" />
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
          <form onSubmit={invite} className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5">
            <h2 className="font-semibold">Invite member</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              The invitation reserves the requested seat class and can be cancelled or rotated.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input className={field + ' sm:col-span-2'} name="email" type="email" placeholder="Email" required />
              <select className={field} name="seatClass" defaultValue="FULL">
                <option value="FULL">Full</option>
                <option value="LIGHT">Light</option>
                <option value="ATTENDANCE_ONLY">Attendance only</option>
                <option value="GUEST">Guest</option>
              </select>
              <select className={field} name="workspaceId" defaultValue="">
                <option value="">Default workspace</option>
                {session.organization.workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                ))}
              </select>
              <select className={field} name="branchId" defaultValue="">
                <option value="">No branch</option>
                {session.organization.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
              <button disabled={busy === 'invite'} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-50">
                Create invitation
              </button>
            </div>
          </form>

          <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1017]">
            <div className="border-b border-white/10 px-5 py-4">
              <h2 className="font-semibold">Invitation ledger</h2>
              <p className="mt-1 text-xs text-zinc-600">Token rotation invalidates the previous invitation token.</p>
            </div>
            <div className="divide-y divide-white/[0.06]">
              {invitations.map((inviteRow) => (
                <div key={inviteRow.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_.5fr_.6fr_auto] lg:items-center">
                  <div>
                    <div className="text-sm font-medium">{inviteRow.email}</div>
                    <div className="mt-1 text-xs text-zinc-600">{inviteRow.seatClass}</div>
                  </div>
                  <div className="text-xs text-zinc-400">{inviteRow.status}</div>
                  <div className="text-xs text-zinc-600">
                    {new Date(inviteRow.expiresAt).toLocaleString()}
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={inviteRow.status !== 'PENDING' || busy !== ''}
                      onClick={() => void invitationAction(inviteRow.id, 'resend')}
                      className="rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-30"
                    >
                      Rotate
                    </button>
                    <button
                      disabled={inviteRow.status !== 'PENDING' || busy !== ''}
                      onClick={() => void invitationAction(inviteRow.id, 'cancel')}
                      className="rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-300 disabled:opacity-30"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
              {!invitations.length ? <Empty label="No invitations yet." /> : null}
            </div>
          </section>
        </div>

        <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1017]">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="font-semibold">Members & roles</h2>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {members.map((member) => (
              <div key={member.membershipId} className="grid gap-4 px-5 py-5 xl:grid-cols-[1.1fr_.55fr_1.35fr_auto] xl:items-start">
                <div>
                  <div className="font-medium">
                    {member.displayName}
                    {member.isOwner ? <span className="ml-2 text-xs text-amber-300">Owner</span> : null}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">{member.email}</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    Seat: {member.seat?.accessClass ?? 'None'} · Teams: {member.teams.map((t) => t.teamName).join(', ') || 'None'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Status</div>
                  <div className={member.status === 'ACTIVE' ? 'mt-1 text-sm text-emerald-300' : 'mt-1 text-sm text-amber-300'}>
                    {member.status}
                  </div>
                </div>
                <form onSubmit={(event) => void updateMemberRoles(member, event)}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {roles.filter((role) => role.key !== 'owner').map((role) => (
                      <label key={role.id} className="flex items-center gap-2 rounded-lg border border-white/[0.07] px-3 py-2 text-xs text-zinc-400">
                        <input
                          type="checkbox"
                          name="roleId"
                          value={role.id}
                          defaultChecked={member.roles.some((item) => item.roleId === role.id)}
                          disabled={member.isOwner}
                        />
                        {role.name}
                      </label>
                    ))}
                  </div>
                  {!member.isOwner ? (
                    <button disabled={busy !== ''} className="mt-2 rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-40">
                      Save roles
                    </button>
                  ) : null}
                </form>
                <button
                  disabled={member.isOwner || busy !== ''}
                  onClick={() => void toggleMember(member)}
                  className="rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-30"
                >
                  {member.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                </button>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
            <h2 className="font-semibold">Create scoped role</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              Create a role with its first permission; additional grants can be extended from the API-backed role editor later without changing the policy model.
            </p>
            <form onSubmit={createRole} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input className={field} name="key" placeholder="role-key" required />
              <input className={field} name="name" placeholder="Role name" required />
              <input className={field + ' sm:col-span-2'} name="description" placeholder="Description" />
              <select className={field} value={rolePermissionKey} onChange={(event) => setRolePermissionKey(event.target.value)}>
                {permissions.map((permission) => (
                  <option key={permission.id} value={permission.key}>{permission.key}</option>
                ))}
              </select>
              <select className={field} value={roleScope} onChange={(event) => setRoleScope(event.target.value as Scope)}>
                {scopes.map((scope) => <option key={scope}>{scope}</option>)}
              </select>
              <button disabled={busy !== ''} className="h-10 rounded-xl bg-violet-300 text-sm font-semibold text-zinc-950 disabled:opacity-50 sm:col-span-2">
                Create role
              </button>
            </form>

            <div className="mt-5 space-y-2">
              {roles.map((role) => (
                <div key={role.id} className="rounded-xl border border-white/[0.07] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{role.name}</div>
                    <div className="font-mono text-[10px] text-zinc-600">{role.key}</div>
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    {role.permissions.map((grant) => grant.permissionKey + ':' + grant.scope).join(' · ') || 'No grants'}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
            <h2 className="font-semibold">Teams</h2>
            <form onSubmit={createTeam} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input className={field + ' sm:col-span-2'} name="name" placeholder="Team name" required />
              <select className={field} name="workspaceId" defaultValue="">
                <option value="">Default workspace</option>
                {session.organization.workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                ))}
              </select>
              <select className={field} name="branchId" defaultValue="">
                <option value="">No branch</option>
                {session.organization.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
              <button disabled={busy !== ''} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-50 sm:col-span-2">
                Create team
              </button>
            </form>

            <div className="mt-5 space-y-3">
              {teams.map((team) => (
                <form key={team.id} onSubmit={(event) => void updateTeamMembers(team, event)} className="rounded-xl border border-white/[0.07] p-4">
                  <div className="font-medium">{team.name}</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {members.map((member) => (
                      <label key={member.membershipId} className="flex items-center gap-2 text-xs text-zinc-400">
                        <input
                          type="checkbox"
                          name="memberId"
                          value={member.membershipId}
                          defaultChecked={team.memberIds.includes(member.membershipId)}
                        />
                        {member.displayName}
                      </label>
                    ))}
                  </div>
                  <button disabled={busy !== ''} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-40">
                    Save members
                  </button>
                </form>
              ))}
              {!teams.length ? <Empty label="No teams yet." /> : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
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

function Empty({ label }: { label: string }) {
  return <div className="px-5 py-10 text-center text-sm text-zinc-600">{label}</div>;
}
