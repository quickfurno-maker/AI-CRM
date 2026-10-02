import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { and, count, eq, gt, inArray } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  auditLogs,
  branches,
  entitlements,
  memberRoles,
  organizationMembers,
  organizations,
  outboxEvents,
  permissions,
  rolePermissions,
  roles,
  sessions,
  teamMembers,
  teams,
  users,
  workspaces,
} from '../../platform/database/schema.js';
import {
  memberSeatAssignments,
  staffProfiles,
} from '../staff/staff.schema.js';
import type {
  AcceptInvitationDto,
  CreateInvitationDto,
  CreateRoleDto,
  CreateTeamDto,
  SetMemberRolesDto,
  SetRolePermissionsDto,
  SetTeamMembersDto,
  UpdateMemberStatusDto,
} from './team-admin.dto.js';
import { organizationInvitations } from './team-admin.schema.js';

type AccessClass = 'FULL' | 'LIGHT' | 'ATTENDANCE_ONLY' | 'GUEST';

@Injectable()
export class TeamAdminService {
  constructor(private readonly database: DatabaseService) {}

  async listMembers(principal: Principal) {
    const [members, roleRows, teamRows, seats, staff] = await Promise.all([
      this.database.db
        .select({
          membershipId: organizationMembers.id,
          status: organizationMembers.status,
          isOwner: organizationMembers.isOwner,
          joinedAt: organizationMembers.joinedAt,
          userId: users.id,
          email: users.email,
          displayName: users.displayName,
        })
        .from(organizationMembers)
        .innerJoin(users, eq(users.id, organizationMembers.userId))
        .where(eq(organizationMembers.organizationId, principal.organizationId)),
      this.database.db
        .select({
          membershipId: memberRoles.organizationMemberId,
          roleId: roles.id,
          roleKey: roles.key,
          roleName: roles.name,
        })
        .from(memberRoles)
        .innerJoin(roles, eq(roles.id, memberRoles.roleId))
        .where(eq(memberRoles.organizationId, principal.organizationId)),
      this.database.db
        .select({
          membershipId: teamMembers.organizationMemberId,
          teamId: teams.id,
          teamName: teams.name,
        })
        .from(teamMembers)
        .innerJoin(teams, eq(teams.id, teamMembers.teamId))
        .where(eq(teamMembers.organizationId, principal.organizationId)),
      this.database.db
        .select()
        .from(memberSeatAssignments)
        .where(
          eq(memberSeatAssignments.organizationId, principal.organizationId),
        ),
      this.database.db
        .select()
        .from(staffProfiles)
        .where(eq(staffProfiles.organizationId, principal.organizationId)),
    ]);

    return members.map((member) => ({
      ...member,
      staff:
        staff.find(
          (row) => row.organizationMemberId === member.membershipId,
        ) ?? null,
      seat:
        seats.find(
          (row) =>
            row.organizationMemberId === member.membershipId &&
            row.status === 'ACTIVE',
        ) ?? null,
      roles: roleRows.filter(
        (row) => row.membershipId === member.membershipId,
      ),
      teams: teamRows.filter(
        (row) => row.membershipId === member.membershipId,
      ),
    }));
  }

  listInvitations(principal: Principal) {
    return this.database.db
      .select()
      .from(organizationInvitations)
      .where(
        eq(organizationInvitations.organizationId, principal.organizationId),
      );
  }

  async createInvitation(principal: Principal, dto: CreateInvitationDto) {
    const email = dto.email.trim().toLowerCase();
    const placement = await this.resolvePlacement(
      principal.organizationId,
      dto.workspaceId,
      dto.branchId,
      dto.staffProfileId,
    );
    await this.assertInviteTargets(
      principal.organizationId,
      dto.roleIds ?? [],
      dto.teamIds ?? [],
      placement.workspaceId,
      placement.branchId,
    );
    await this.assertNotMember(principal.organizationId, email);
    await this.assertSeatCapacity(
      principal.organizationId,
      dto.seatClass,
    );

    const token = this.createInvitationToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(
      Date.now() + (dto.expiresInHours ?? 72) * 60 * 60 * 1000,
    );

    const invitation = await this.database.db.transaction(async (tx) => {
      await tx
        .update(organizationInvitations)
        .set({
          status: 'CANCELLED',
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(
              organizationInvitations.organizationId,
              principal.organizationId,
            ),
            eq(organizationInvitations.email, email),
            eq(organizationInvitations.status, 'PENDING'),
          ),
        );

      const [row] = await tx
        .insert(organizationInvitations)
        .values({
          organizationId: principal.organizationId,
          email,
          tokenHash,
          seatClass: dto.seatClass,
          workspaceId: placement.workspaceId,
          branchId: placement.branchId,
          staffProfileId: placement.staffProfileId,
          roleIds: dto.roleIds ?? [],
          teamIds: dto.teamIds ?? [],
          invitedByMemberId: principal.membershipId,
          expiresAt,
        })
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: placement.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'identity.invitation.create',
        resourceType: 'organization_invitation',
        resourceId: row.id,
        after: {
          email,
          seatClass: row.seatClass,
          roleIds: row.roleIds,
          teamIds: row.teamIds,
          expiresAt,
        },
      });

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'identity.invitation.created.v1',
        aggregateType: 'organization_invitation',
        aggregateId: row.id,
        payload: {
          invitationId: row.id,
          email,
          expiresAt: expiresAt.toISOString(),
          deliveryRequired: true,
        },
      });
      return row;
    });

    return {
      invitation: this.safeInvitation(invitation),
      acceptanceToken: token,
      deliveryStatus: 'EXTERNAL_EMAIL_PROVIDER_PENDING',
    };
  }

  async rotateInvitation(
    principal: Principal,
    invitationId: string,
  ) {
    const invitation = await this.getInvitation(
      principal.organizationId,
      invitationId,
    );
    if (invitation.status !== 'PENDING') {
      throw new ConflictException('Only pending invitations can be resent.');
    }

    const token = this.createInvitationToken();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const [updated] = await this.database.db
      .update(organizationInvitations)
      .set({
        tokenHash: this.hashToken(token),
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(organizationInvitations.id, invitationId))
      .returning();

    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      workspaceId: updated.workspaceId,
      actorType: 'USER',
      actorId: principal.userId,
      action: 'identity.invitation.rotate',
      resourceType: 'organization_invitation',
      resourceId: updated.id,
      after: { email: updated.email, expiresAt },
    });

    return {
      invitation: this.safeInvitation(updated),
      acceptanceToken: token,
      deliveryStatus: 'EXTERNAL_EMAIL_PROVIDER_PENDING',
    };
  }

  async cancelInvitation(principal: Principal, invitationId: string) {
    const invitation = await this.getInvitation(
      principal.organizationId,
      invitationId,
    );
    if (invitation.status !== 'PENDING') {
      throw new ConflictException('Invitation is no longer pending.');
    }
    const [updated] = await this.database.db
      .update(organizationInvitations)
      .set({
        status: 'CANCELLED',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizationInvitations.id, invitationId))
      .returning();

    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      actorType: 'USER',
      actorId: principal.userId,
      action: 'identity.invitation.cancel',
      resourceType: 'organization_invitation',
      resourceId: updated.id,
      after: { email: updated.email, status: updated.status },
    });
    return this.safeInvitation(updated);
  }

  async acceptInvitation(dto: AcceptInvitationDto) {
    const tokenHash = this.hashToken(dto.token);
    const rows = await this.database.db
      .select({
        invitation: organizationInvitations,
        organizationSlug: organizations.slug,
      })
      .from(organizationInvitations)
      .innerJoin(
        organizations,
        eq(organizations.id, organizationInvitations.organizationId),
      )
      .where(
        and(
          eq(organizationInvitations.tokenHash, tokenHash),
          eq(organizationInvitations.status, 'PENDING'),
          gt(organizationInvitations.expiresAt, new Date()),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new UnauthorizedException(
        'Invitation token is invalid, expired or already used.',
      );
    }

    await this.assertSeatCapacity(
      row.invitation.organizationId,
      row.invitation.seatClass as AccessClass,
    );

    const result = await this.database.db.transaction(async (tx) => {
      const existingUsers = await tx
        .select()
        .from(users)
        .where(eq(users.email, row.invitation.email))
        .limit(1);
      let user = existingUsers[0];

      if (!user) {
        if (!dto.password || !dto.displayName) {
          throw new BadRequestException(
            'Display name and password are required for a new account.',
          );
        }
        const passwordHash = await hash(dto.password, 12);
        [user] = await tx
          .insert(users)
          .values({
            email: row.invitation.email,
            passwordHash,
            displayName: dto.displayName.trim(),
          })
          .returning();
      }

      const existingMemberships = await tx
        .select({ id: organizationMembers.id })
        .from(organizationMembers)
        .where(
          and(
            eq(
              organizationMembers.organizationId,
              row.invitation.organizationId,
            ),
            eq(organizationMembers.userId, user.id),
          ),
        )
        .limit(1);
      if (existingMemberships.length) {
        throw new ConflictException(
          'This account is already a member of the organization.',
        );
      }

      const [membership] = await tx
        .insert(organizationMembers)
        .values({
          organizationId: row.invitation.organizationId,
          userId: user.id,
          status: 'ACTIVE',
          isOwner: false,
        })
        .returning();

      await tx.insert(memberSeatAssignments).values({
        organizationId: row.invitation.organizationId,
        organizationMemberId: membership.id,
        accessClass: row.invitation.seatClass,
        status: 'ACTIVE',
        assignedByMemberId: row.invitation.invitedByMemberId,
      });

      if (row.invitation.roleIds.length) {
        await tx.insert(memberRoles).values(
          row.invitation.roleIds.map((roleId) => ({
            organizationId: row.invitation.organizationId,
            organizationMemberId: membership.id,
            roleId,
          })),
        );
      }

      if (row.invitation.teamIds.length) {
        await tx.insert(teamMembers).values(
          row.invitation.teamIds.map((teamId) => ({
            organizationId: row.invitation.organizationId,
            teamId,
            organizationMemberId: membership.id,
          })),
        );
      }

      if (row.invitation.staffProfileId) {
        const staffRows = await tx
          .select()
          .from(staffProfiles)
          .where(
            and(
              eq(
                staffProfiles.organizationId,
                row.invitation.organizationId,
              ),
              eq(staffProfiles.id, row.invitation.staffProfileId),
            ),
          )
          .limit(1);
        const staff = staffRows[0];
        if (!staff || staff.organizationMemberId) {
          throw new ConflictException(
            'Invitation staff profile is no longer available.',
          );
        }
        await tx
          .update(staffProfiles)
          .set({
            organizationMemberId: membership.id,
            updatedAt: new Date(),
          })
          .where(eq(staffProfiles.id, staff.id));
      }

      const [accepted] = await tx
        .update(organizationInvitations)
        .set({
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(organizationInvitations.id, row.invitation.id),
            eq(organizationInvitations.status, 'PENDING'),
          ),
        )
        .returning();
      if (!accepted) {
        throw new ConflictException('Invitation was already consumed.');
      }

      await tx.insert(auditLogs).values({
        organizationId: row.invitation.organizationId,
        workspaceId: row.invitation.workspaceId,
        actorType: 'USER',
        actorId: user.id,
        action: 'identity.invitation.accept',
        resourceType: 'organization_member',
        resourceId: membership.id,
        after: {
          invitationId: row.invitation.id,
          email: user.email,
          seatClass: row.invitation.seatClass,
        },
      });

      await tx.insert(outboxEvents).values({
        organizationId: row.invitation.organizationId,
        eventType: 'identity.member.joined.v1',
        aggregateType: 'organization_member',
        aggregateId: membership.id,
        payload: {
          membershipId: membership.id,
          invitationId: row.invitation.id,
          seatClass: row.invitation.seatClass,
        },
      });

      return { user, membership };
    });

    return {
      organizationSlug: row.organizationSlug,
      membershipId: result.membership.id,
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName,
      },
      seatClass: row.invitation.seatClass,
      next: 'LOGIN',
    };
  }

  async listRoles(principal: Principal) {
    const [roleRows, grants] = await Promise.all([
      this.database.db
        .select()
        .from(roles)
        .where(eq(roles.organizationId, principal.organizationId)),
      this.database.db
        .select({
          roleId: rolePermissions.roleId,
          permissionKey: permissions.key,
          scope: rolePermissions.scope,
        })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
        .where(eq(roles.organizationId, principal.organizationId)),
    ]);
    return roleRows.map((role) => ({
      ...role,
      permissions: grants.filter((grant) => grant.roleId === role.id),
    }));
  }

  async createRole(principal: Principal, dto: CreateRoleDto) {
    if (dto.key === 'owner') {
      throw new BadRequestException('The owner role is reserved.');
    }
    const grants = await this.resolvePermissionGrants(dto.permissions);

    return this.database.db.transaction(async (tx) => {
      const [role] = await tx
        .insert(roles)
        .values({
          organizationId: principal.organizationId,
          key: dto.key,
          name: dto.name.trim(),
          description: dto.description?.trim(),
          isSystem: false,
        })
        .returning();

      if (grants.length) {
        await tx.insert(rolePermissions).values(
          grants.map((grant) => ({
            roleId: role.id,
            permissionId: grant.permissionId,
            scope: grant.scope,
          })),
        );
      }

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'identity.role.create',
        resourceType: 'role',
        resourceId: role.id,
        after: {
          key: role.key,
          name: role.name,
          permissions: dto.permissions,
        },
      });
      return role;
    });
  }

  async setRolePermissions(
    principal: Principal,
    roleId: string,
    dto: SetRolePermissionsDto,
  ) {
    const role = await this.getRole(principal.organizationId, roleId);
    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be modified.');
    }
    const grants = await this.resolvePermissionGrants(dto.permissions);

    await this.database.db.transaction(async (tx) => {
      await tx
        .delete(rolePermissions)
        .where(eq(rolePermissions.roleId, roleId));
      if (grants.length) {
        await tx.insert(rolePermissions).values(
          grants.map((grant) => ({
            roleId,
            permissionId: grant.permissionId,
            scope: grant.scope,
          })),
        );
      }
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'identity.role.permissions_set',
        resourceType: 'role',
        resourceId: roleId,
        after: { permissions: dto.permissions },
      });
    });
    return this.listRoles(principal);
  }

  async setMemberRoles(
    principal: Principal,
    membershipId: string,
    dto: SetMemberRolesDto,
  ) {
    const member = await this.getMember(
      principal.organizationId,
      membershipId,
    );
    if (member.isOwner) {
      throw new ForbiddenException('Owner role assignments are immutable.');
    }
    if (dto.roleIds.length) {
      const roleRows = await this.database.db
        .select({ id: roles.id, key: roles.key })
        .from(roles)
        .where(
          and(
            eq(roles.organizationId, principal.organizationId),
            inArray(roles.id, dto.roleIds),
          ),
        );
      if (roleRows.length !== new Set(dto.roleIds).size) {
        throw new NotFoundException('One or more roles were not found.');
      }
      if (roleRows.some((role) => role.key === 'owner')) {
        throw new ForbiddenException('Owner role cannot be assigned.');
      }
    }

    await this.database.db.transaction(async (tx) => {
      await tx
        .delete(memberRoles)
        .where(eq(memberRoles.organizationMemberId, membershipId));
      if (dto.roleIds.length) {
        await tx.insert(memberRoles).values(
          [...new Set(dto.roleIds)].map((roleId) => ({
            organizationId: principal.organizationId,
            organizationMemberId: membershipId,
            roleId,
          })),
        );
      }
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'identity.member.roles_set',
        resourceType: 'organization_member',
        resourceId: membershipId,
        after: { roleIds: dto.roleIds },
      });
    });
    return this.listMembers(principal);
  }

  async listTeams(principal: Principal) {
    const [teamRows, members] = await Promise.all([
      this.database.db
        .select()
        .from(teams)
        .where(eq(teams.organizationId, principal.organizationId)),
      this.database.db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.organizationId, principal.organizationId)),
    ]);
    return teamRows.map((team) => ({
      ...team,
      memberIds: members
        .filter((member) => member.teamId === team.id)
        .map((member) => member.organizationMemberId),
    }));
  }

  async createTeam(principal: Principal, dto: CreateTeamDto) {
    const placement = await this.resolvePlacement(
      principal.organizationId,
      dto.workspaceId,
      dto.branchId,
    );
    const [team] = await this.database.db
      .insert(teams)
      .values({
        organizationId: principal.organizationId,
        workspaceId: placement.workspaceId,
        branchId: placement.branchId,
        name: dto.name.trim(),
      })
      .returning();

    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      workspaceId: placement.workspaceId,
      actorType: 'USER',
      actorId: principal.userId,
      action: 'identity.team.create',
      resourceType: 'team',
      resourceId: team.id,
      after: team,
    });
    return team;
  }

  async setTeamMembers(
    principal: Principal,
    teamId: string,
    dto: SetTeamMembersDto,
  ) {
    const team = await this.getTeam(principal.organizationId, teamId);
    if (dto.memberIds.length) {
      const rows = await this.database.db
        .select({ id: organizationMembers.id })
        .from(organizationMembers)
        .where(
          and(
            eq(
              organizationMembers.organizationId,
              principal.organizationId,
            ),
            inArray(organizationMembers.id, dto.memberIds),
          ),
        );
      if (rows.length !== new Set(dto.memberIds).size) {
        throw new NotFoundException('One or more members were not found.');
      }
    }

    await this.database.db.transaction(async (tx) => {
      await tx.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
      if (dto.memberIds.length) {
        await tx.insert(teamMembers).values(
          [...new Set(dto.memberIds)].map((organizationMemberId) => ({
            organizationId: principal.organizationId,
            teamId,
            organizationMemberId,
          })),
        );
      }
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: team.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'identity.team.members_set',
        resourceType: 'team',
        resourceId: teamId,
        after: { memberIds: dto.memberIds },
      });
    });
    return this.listTeams(principal);
  }

  async updateMemberStatus(
    principal: Principal,
    membershipId: string,
    dto: UpdateMemberStatusDto,
  ) {
    const member = await this.getMember(
      principal.organizationId,
      membershipId,
    );
    if (member.isOwner) {
      throw new ForbiddenException('Organization owner cannot be suspended.');
    }

    await this.database.db.transaction(async (tx) => {
      await tx
        .update(organizationMembers)
        .set({ status: dto.status })
        .where(eq(organizationMembers.id, membershipId));

      if (dto.status === 'SUSPENDED') {
        await tx
          .update(sessions)
          .set({ revokedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(sessions.organizationId, principal.organizationId),
              eq(sessions.organizationMemberId, membershipId),
            ),
          );
      }

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'identity.member.status_change',
        resourceType: 'organization_member',
        resourceId: membershipId,
        before: { status: member.status },
        after: { status: dto.status },
      });
    });

    return this.listMembers(principal);
  }

  private async resolvePlacement(
    organizationId: string,
    workspaceId?: string,
    branchId?: string,
    staffProfileId?: string,
  ) {
    let staff:
      | typeof staffProfiles.$inferSelect
      | undefined;
    if (staffProfileId) {
      const rows = await this.database.db
        .select()
        .from(staffProfiles)
        .where(
          and(
            eq(staffProfiles.organizationId, organizationId),
            eq(staffProfiles.id, staffProfileId),
          ),
        )
        .limit(1);
      staff = rows[0];
      if (!staff) throw new NotFoundException('Staff profile not found.');
      if (staff.organizationMemberId) {
        throw new ConflictException(
          'Staff profile already has a login membership.',
        );
      }
    }

    const resolvedWorkspaceId = workspaceId ?? staff?.workspaceId;
    const workspaceRows = resolvedWorkspaceId
      ? await this.database.db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(
            and(
              eq(workspaces.organizationId, organizationId),
              eq(workspaces.id, resolvedWorkspaceId),
            ),
          )
          .limit(1)
      : await this.database.db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.organizationId, organizationId))
          .limit(1);
    const workspace = workspaceRows[0];
    if (!workspace) throw new NotFoundException('Workspace not found.');

    if (staff && staff.workspaceId !== workspace.id) {
      throw new BadRequestException(
        'Staff profile belongs to another workspace.',
      );
    }

    const resolvedBranchId = branchId ?? staff?.branchId ?? undefined;
    if (resolvedBranchId) {
      const branchRows = await this.database.db
        .select({ id: branches.id })
        .from(branches)
        .where(
          and(
            eq(branches.organizationId, organizationId),
            eq(branches.workspaceId, workspace.id),
            eq(branches.id, resolvedBranchId),
          ),
        )
        .limit(1);
      if (!branchRows[0]) {
        throw new NotFoundException(
          'Branch was not found in the selected workspace.',
        );
      }
      if (staff?.branchId && staff.branchId !== resolvedBranchId) {
        throw new BadRequestException(
          'Staff profile belongs to another branch.',
        );
      }
    }

    return {
      workspaceId: workspace.id,
      branchId: resolvedBranchId,
      staffProfileId: staff?.id,
    };
  }

  private async assertInviteTargets(
    organizationId: string,
    roleIds: string[],
    teamIds: string[],
    workspaceId: string,
    branchId?: string,
  ) {
    const uniqueRoleIds = [...new Set(roleIds)];
    if (uniqueRoleIds.length) {
      const roleRows = await this.database.db
        .select({ id: roles.id, key: roles.key })
        .from(roles)
        .where(
          and(
            eq(roles.organizationId, organizationId),
            inArray(roles.id, uniqueRoleIds),
          ),
        );
      if (roleRows.length !== uniqueRoleIds.length) {
        throw new NotFoundException('One or more invitation roles were not found.');
      }
      if (roleRows.some((role) => role.key === 'owner')) {
        throw new ForbiddenException('Owner role cannot be invited.');
      }
    }

    const uniqueTeamIds = [...new Set(teamIds)];
    if (uniqueTeamIds.length) {
      const teamRows = await this.database.db
        .select()
        .from(teams)
        .where(
          and(
            eq(teams.organizationId, organizationId),
            inArray(teams.id, uniqueTeamIds),
          ),
        );
      if (teamRows.length !== uniqueTeamIds.length) {
        throw new NotFoundException('One or more invitation teams were not found.');
      }
      if (
        teamRows.some(
          (team) =>
            team.workspaceId !== workspaceId ||
            (team.branchId && team.branchId !== branchId),
        )
      ) {
        throw new BadRequestException(
          'Invitation teams must match the selected workspace/branch placement.',
        );
      }
    }
  }

  private async assertNotMember(organizationId: string, email: string) {
    const rows = await this.database.db
      .select({ membershipId: organizationMembers.id })
      .from(users)
      .innerJoin(
        organizationMembers,
        eq(organizationMembers.userId, users.id),
      )
      .where(
        and(
          eq(users.email, email),
          eq(organizationMembers.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (rows.length) {
      throw new ConflictException(
        'This email is already a member of the organization.',
      );
    }
  }

  private async assertSeatCapacity(
    organizationId: string,
    accessClass: AccessClass,
  ) {
    const entitlementKey: Record<AccessClass, string> = {
      FULL: 'seats.full.max',
      LIGHT: 'seats.light.max',
      ATTENDANCE_ONLY: 'seats.attendance.max',
      GUEST: 'seats.guest.max',
    };
    const rows = await this.database.db
      .select({
        enabled: entitlements.enabled,
        limitValue: entitlements.limitValue,
      })
      .from(entitlements)
      .where(
        and(
          eq(entitlements.organizationId, organizationId),
          eq(entitlements.key, entitlementKey[accessClass]),
        ),
      )
      .limit(1);
    let entitlement = rows[0];

    if (!entitlement && accessClass === 'FULL') {
      const legacyRows = await this.database.db
        .select({
          enabled: entitlements.enabled,
          limitValue: entitlements.limitValue,
        })
        .from(entitlements)
        .where(
          and(
            eq(entitlements.organizationId, organizationId),
            eq(entitlements.key, 'users.max'),
          ),
        )
        .limit(1);
      entitlement = legacyRows[0];
    }

    if (!entitlement) {
      if (accessClass === 'ATTENDANCE_ONLY' || accessClass === 'GUEST') return;
      throw new ConflictException(
        `${accessClass} seats are not enabled for this plan.`,
      );
    }
    if (!entitlement.enabled) {
      throw new ConflictException(
        `${accessClass} seats are disabled for this plan.`,
      );
    }
    if (entitlement.limitValue === null) return;

    const usageRows = await this.database.db
      .select({ value: count() })
      .from(memberSeatAssignments)
      .where(
        and(
          eq(memberSeatAssignments.organizationId, organizationId),
          eq(memberSeatAssignments.accessClass, accessClass),
          eq(memberSeatAssignments.status, 'ACTIVE'),
        ),
      );
    if (Number(usageRows[0]?.value ?? 0) >= entitlement.limitValue) {
      throw new ConflictException(
        `${accessClass} seat limit reached (${entitlement.limitValue}).`,
      );
    }
  }

  private async resolvePermissionGrants(
    requested: Array<{
      key: string;
      scope: 'OWN' | 'TEAM' | 'BRANCH' | 'WORKSPACE' | 'ORGANIZATION';
    }>,
  ) {
    if (!requested.length) return [];
    const unique = new Map(requested.map((grant) => [grant.key, grant]));
    const permissionRows = await this.database.db
      .select({ id: permissions.id, key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, [...unique.keys()]));
    if (permissionRows.length !== unique.size) {
      throw new NotFoundException('One or more permissions were not found.');
    }
    return permissionRows.map((permission) => ({
      permissionId: permission.id,
      scope: unique.get(permission.key)!.scope,
    }));
  }

  private async getInvitation(
    organizationId: string,
    invitationId: string,
  ) {
    const rows = await this.database.db
      .select()
      .from(organizationInvitations)
      .where(
        and(
          eq(organizationInvitations.organizationId, organizationId),
          eq(organizationInvitations.id, invitationId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Invitation not found.');
    return rows[0];
  }

  private async getRole(organizationId: string, roleId: string) {
    const rows = await this.database.db
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.organizationId, organizationId),
          eq(roles.id, roleId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Role not found.');
    return rows[0];
  }

  private async getMember(organizationId: string, membershipId: string) {
    const rows = await this.database.db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.id, membershipId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Member not found.');
    return rows[0];
  }

  private async getTeam(organizationId: string, teamId: string) {
    const rows = await this.database.db
      .select()
      .from(teams)
      .where(
        and(
          eq(teams.organizationId, organizationId),
          eq(teams.id, teamId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Team not found.');
    return rows[0];
  }

  private createInvitationToken() {
    return `inv_${randomBytes(36).toString('base64url')}`;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private safeInvitation(
    invitation: typeof organizationInvitations.$inferSelect,
  ) {
    const { tokenHash: _tokenHash, ...safe } = invitation;
    return safe;
  }
}
