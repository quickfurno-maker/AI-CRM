import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  auditLogs,
  branches,
  entitlements,
  organizationMembers,
  outboxEvents,
  sessions,
  users,
  workspaces,
} from '../../platform/database/schema.js';
import type {
  AssignSeatDto,
  CreateStaffDto,
  StaffListQueryDto,
  UpdateStaffDto,
} from './staff.dto.js';
import {
  memberSeatAssignments,
  staffProfiles,
} from './staff.schema.js';

type AccessClass = 'FULL' | 'LIGHT' | 'ATTENDANCE_ONLY' | 'GUEST';

@Injectable()
export class StaffService {
  constructor(private readonly database: DatabaseService) {}

  async listStaff(principal: Principal, query: StaffListQueryDto) {
    let rows = await this.database.db
      .select({
        profile: staffProfiles,
        memberStatus: organizationMembers.status,
        seatClass: memberSeatAssignments.accessClass,
        seatStatus: memberSeatAssignments.status,
      })
      .from(staffProfiles)
      .leftJoin(
        organizationMembers,
        eq(organizationMembers.id, staffProfiles.organizationMemberId),
      )
      .leftJoin(
        memberSeatAssignments,
        eq(
          memberSeatAssignments.organizationMemberId,
          staffProfiles.organizationMemberId,
        ),
      )
      .where(eq(staffProfiles.organizationId, principal.organizationId))
      .limit(query.limit);

    if (query.workspaceId) {
      rows = rows.filter(
        (row) => row.profile.workspaceId === query.workspaceId,
      );
    }
    if (query.branchId) {
      rows = rows.filter((row) => row.profile.branchId === query.branchId);
    }
    if (query.status) {
      rows = rows.filter((row) => row.profile.status === query.status);
    }
    if (query.search) {
      const needle = query.search.trim().toLowerCase();
      rows = rows.filter((row) =>
        [
          row.profile.displayName,
          row.profile.employeeCode,
          row.profile.email,
          row.profile.phone,
          row.profile.designation,
          row.profile.department,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle)),
      );
    }

    return rows.map((row) => ({
      ...row.profile,
      login: row.profile.organizationMemberId
        ? {
            membershipId: row.profile.organizationMemberId,
            membershipStatus: row.memberStatus,
          }
        : null,
      seat:
        row.seatClass && row.seatStatus === 'ACTIVE'
          ? {
              accessClass: row.seatClass,
              status: row.seatStatus,
              consumesFullSeat: row.seatClass === 'FULL',
            }
          : null,
    }));
  }

  async createStaff(principal: Principal, dto: CreateStaffDto) {
    const workspaceId = await this.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    await this.assertBranch(
      principal.organizationId,
      workspaceId,
      dto.branchId,
    );
    await this.assertMembership(
      principal.organizationId,
      dto.organizationMemberId,
    );
    await this.assertMembership(
      principal.organizationId,
      dto.managerMemberId,
    );

    const duplicate = await this.database.db
      .select({ id: staffProfiles.id })
      .from(staffProfiles)
      .where(
        and(
          eq(staffProfiles.organizationId, principal.organizationId),
          eq(staffProfiles.employeeCode, dto.employeeCode.trim()),
        ),
      )
      .limit(1);
    if (duplicate.length) {
      throw new ConflictException('Employee code already exists.');
    }

    if (dto.organizationMemberId) {
      const linked = await this.database.db
        .select({ id: staffProfiles.id })
        .from(staffProfiles)
        .where(
          and(
            eq(staffProfiles.organizationId, principal.organizationId),
            eq(
              staffProfiles.organizationMemberId,
              dto.organizationMemberId,
            ),
          ),
        )
        .limit(1);
      if (linked.length) {
        throw new ConflictException(
          'This login membership is already linked to a staff profile.',
        );
      }
    }

    return this.database.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(staffProfiles)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          branchId: dto.branchId,
          organizationMemberId: dto.organizationMemberId,
          managerMemberId: dto.managerMemberId,
          employeeCode: dto.employeeCode.trim(),
          displayName: dto.displayName.trim(),
          email: dto.email?.trim().toLowerCase(),
          phone: dto.phone?.trim(),
          designation: dto.designation?.trim(),
          department: dto.department?.trim(),
          employmentType: dto.employmentType ?? 'FULL_TIME',
          joiningDate: dto.joiningDate,
          metadata: dto.metadata,
        })
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'staff.profile.create',
        resourceType: 'staff_profile',
        resourceId: created.id,
        after: {
          employeeCode: created.employeeCode,
          displayName: created.displayName,
          organizationMemberId: created.organizationMemberId,
        },
      });

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'identity.staff.created.v1',
        aggregateType: 'staff_profile',
        aggregateId: created.id,
        payload: {
          staffProfileId: created.id,
          employeeCode: created.employeeCode,
          organizationMemberId: created.organizationMemberId,
          seatAssigned: false,
        },
      });

      return created;
    });
  }

  async updateStaff(
    principal: Principal,
    id: string,
    dto: UpdateStaffDto,
  ) {
    const existing = await this.getStaff(principal.organizationId, id);

    await this.assertBranch(
      principal.organizationId,
      existing.workspaceId,
      dto.branchId,
    );
    await this.assertMembership(
      principal.organizationId,
      dto.organizationMemberId,
    );
    await this.assertMembership(
      principal.organizationId,
      dto.managerMemberId,
    );

    if (
      dto.organizationMemberId &&
      dto.organizationMemberId !== existing.organizationMemberId
    ) {
      const linked = await this.database.db
        .select({ id: staffProfiles.id })
        .from(staffProfiles)
        .where(
          and(
            eq(staffProfiles.organizationId, principal.organizationId),
            eq(
              staffProfiles.organizationMemberId,
              dto.organizationMemberId,
            ),
          ),
        )
        .limit(1);
      if (linked.length) {
        throw new ConflictException(
          'This login membership is already linked to another staff profile.',
        );
      }
    }

    const values = {
      ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
      ...(dto.organizationMemberId !== undefined
        ? { organizationMemberId: dto.organizationMemberId }
        : {}),
      ...(dto.managerMemberId !== undefined
        ? { managerMemberId: dto.managerMemberId }
        : {}),
      ...(dto.displayName !== undefined
        ? { displayName: dto.displayName.trim() }
        : {}),
      ...(dto.email !== undefined
        ? { email: dto.email.trim().toLowerCase() }
        : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
      ...(dto.designation !== undefined
        ? { designation: dto.designation.trim() }
        : {}),
      ...(dto.department !== undefined
        ? { department: dto.department.trim() }
        : {}),
      ...(dto.employmentType !== undefined
        ? { employmentType: dto.employmentType }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.exitDate !== undefined ? { exitDate: dto.exitDate } : {}),
      ...(dto.metadata !== undefined ? { metadata: dto.metadata } : {}),
      updatedAt: new Date(),
    };

    return this.database.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(staffProfiles)
        .set(values)
        .where(
          and(
            eq(staffProfiles.id, id),
            eq(staffProfiles.organizationId, principal.organizationId),
          ),
        )
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: existing.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'staff.profile.update',
        resourceType: 'staff_profile',
        resourceId: id,
        before: {
          displayName: existing.displayName,
          status: existing.status,
          organizationMemberId: existing.organizationMemberId,
        },
        after: {
          displayName: updated.displayName,
          status: updated.status,
          organizationMemberId: updated.organizationMemberId,
        },
      });

      return updated;
    });
  }

  async listMembers(principal: Principal) {
    const rows = await this.database.db
      .select({
        membershipId: organizationMembers.id,
        membershipStatus: organizationMembers.status,
        isOwner: organizationMembers.isOwner,
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        staffProfileId: staffProfiles.id,
        employeeCode: staffProfiles.employeeCode,
        seatId: memberSeatAssignments.id,
        accessClass: memberSeatAssignments.accessClass,
        seatStatus: memberSeatAssignments.status,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .leftJoin(
        staffProfiles,
        eq(staffProfiles.organizationMemberId, organizationMembers.id),
      )
      .leftJoin(
        memberSeatAssignments,
        eq(
          memberSeatAssignments.organizationMemberId,
          organizationMembers.id,
        ),
      )
      .where(
        eq(organizationMembers.organizationId, principal.organizationId),
      );

    return rows.map((row) => ({
      ...row,
      seat:
        row.seatId && row.seatStatus === 'ACTIVE'
          ? {
              id: row.seatId,
              accessClass: row.accessClass,
              status: row.seatStatus,
              consumesFullSeat: row.accessClass === 'FULL',
            }
          : null,
    }));
  }

  async listSeats(principal: Principal) {
    return this.database.db
      .select()
      .from(memberSeatAssignments)
      .where(
        eq(
          memberSeatAssignments.organizationId,
          principal.organizationId,
        ),
      );
  }

  async seatSummary(principal: Principal) {
    const [seatRows, entitlementRows, staffRows] = await Promise.all([
      this.database.db
        .select({
          accessClass: memberSeatAssignments.accessClass,
          status: memberSeatAssignments.status,
        })
        .from(memberSeatAssignments)
        .where(
          eq(
            memberSeatAssignments.organizationId,
            principal.organizationId,
          ),
        ),
      this.database.db
        .select({
          key: entitlements.key,
          enabled: entitlements.enabled,
          limitValue: entitlements.limitValue,
        })
        .from(entitlements)
        .where(eq(entitlements.organizationId, principal.organizationId)),
      this.database.db
        .select({ id: staffProfiles.id, status: staffProfiles.status })
        .from(staffProfiles)
        .where(eq(staffProfiles.organizationId, principal.organizationId)),
    ]);

    const active = seatRows.filter((row) => row.status === 'ACTIVE');
    const usage = {
      FULL: active.filter((row) => row.accessClass === 'FULL').length,
      LIGHT: active.filter((row) => row.accessClass === 'LIGHT').length,
      ATTENDANCE_ONLY: active.filter(
        (row) => row.accessClass === 'ATTENDANCE_ONLY',
      ).length,
      GUEST: active.filter((row) => row.accessClass === 'GUEST').length,
    };

    return {
      commercialRule:
        'Staff records do not consume paid seats. Billing follows explicit active seat assignments.',
      staffRecords: {
        total: staffRows.length,
        active: staffRows.filter((row) => row.status === 'ACTIVE').length,
        billableByCreation: false,
      },
      seats: {
        usage,
        limits: {
          FULL: this.readSeatLimit(entitlementRows, 'FULL'),
          LIGHT: this.readSeatLimit(entitlementRows, 'LIGHT'),
          ATTENDANCE_ONLY: this.readSeatLimit(
            entitlementRows,
            'ATTENDANCE_ONLY',
          ),
          GUEST: this.readSeatLimit(entitlementRows, 'GUEST'),
        },
      },
    };
  }

  async assignSeat(
    principal: Principal,
    membershipId: string,
    dto: AssignSeatDto,
  ) {
    const member = await this.getMember(
      principal.organizationId,
      membershipId,
    );
    if (member.status !== 'ACTIVE') {
      throw new BadRequestException(
        'A seat can only be assigned to an active membership.',
      );
    }
    if (member.isOwner && dto.accessClass !== 'FULL') {
      throw new BadRequestException(
        'The organization owner must retain a FULL product seat.',
      );
    }

    const existingRows = await this.database.db
      .select()
      .from(memberSeatAssignments)
      .where(
        and(
          eq(
            memberSeatAssignments.organizationId,
            principal.organizationId,
          ),
          eq(
            memberSeatAssignments.organizationMemberId,
            membershipId,
          ),
        ),
      )
      .limit(1);
    const existing = existingRows[0];
    if (
      existing?.status === 'ACTIVE' &&
      existing.accessClass === dto.accessClass
    ) {
      return existing;
    }

    const entitlementRows = await this.database.db
      .select({
        key: entitlements.key,
        enabled: entitlements.enabled,
        limitValue: entitlements.limitValue,
      })
      .from(entitlements)
      .where(eq(entitlements.organizationId, principal.organizationId));
    const limit = this.readSeatLimit(
      entitlementRows,
      dto.accessClass as AccessClass,
    );

    if (limit !== null) {
      const activeRows = await this.database.db
        .select({ memberId: memberSeatAssignments.organizationMemberId })
        .from(memberSeatAssignments)
        .where(
          and(
            eq(
              memberSeatAssignments.organizationId,
              principal.organizationId,
            ),
            eq(memberSeatAssignments.status, 'ACTIVE'),
            eq(memberSeatAssignments.accessClass, dto.accessClass),
          ),
        );
      if (activeRows.length >= limit) {
        throw new ConflictException(
          `${dto.accessClass} seat limit reached (${limit}).`,
        );
      }
    }

    return this.database.db.transaction(async (tx) => {
      const [seat] = await tx
        .insert(memberSeatAssignments)
        .values({
          organizationId: principal.organizationId,
          organizationMemberId: membershipId,
          accessClass: dto.accessClass,
          status: 'ACTIVE',
          assignedByMemberId: principal.membershipId,
          assignedAt: new Date(),
          metadata: dto.metadata,
        })
        .onConflictDoUpdate({
          target: memberSeatAssignments.organizationMemberId,
          set: {
            accessClass: dto.accessClass,
            status: 'ACTIVE',
            assignedByMemberId: principal.membershipId,
            assignedAt: new Date(),
            revokedByMemberId: null,
            revokedAt: null,
            metadata: dto.metadata,
            updatedAt: new Date(),
          },
        })
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'staff.seat.assign',
        resourceType: 'member_seat_assignment',
        resourceId: seat.id,
        before: existing
          ? {
              accessClass: existing.accessClass,
              status: existing.status,
            }
          : undefined,
        after: {
          organizationMemberId: membershipId,
          accessClass: seat.accessClass,
          status: seat.status,
        },
      });

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'identity.member.seat.assigned.v1',
        aggregateType: 'organization_member',
        aggregateId: membershipId,
        payload: {
          organizationMemberId: membershipId,
          accessClass: seat.accessClass,
          consumesFullSeat: seat.accessClass === 'FULL',
        },
      });

      return seat;
    });
  }

  async revokeSeat(principal: Principal, membershipId: string) {
    const member = await this.getMember(
      principal.organizationId,
      membershipId,
    );
    if (member.isOwner) {
      throw new BadRequestException(
        'The organization owner must retain an active product seat.',
      );
    }

    const rows = await this.database.db
      .select()
      .from(memberSeatAssignments)
      .where(
        and(
          eq(
            memberSeatAssignments.organizationId,
            principal.organizationId,
          ),
          eq(
            memberSeatAssignments.organizationMemberId,
            membershipId,
          ),
        ),
      )
      .limit(1);
    const existing = rows[0];
    if (!existing || existing.status !== 'ACTIVE') {
      throw new NotFoundException('Active seat assignment not found.');
    }

    return this.database.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(memberSeatAssignments)
        .set({
          status: 'REVOKED',
          revokedByMemberId: principal.membershipId,
          revokedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(memberSeatAssignments.id, existing.id))
        .returning();

      await tx
        .update(sessions)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(sessions.organizationId, principal.organizationId),
            eq(sessions.organizationMemberId, membershipId),
          ),
        );

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'staff.seat.revoke',
        resourceType: 'member_seat_assignment',
        resourceId: existing.id,
        before: {
          accessClass: existing.accessClass,
          status: existing.status,
        },
        after: {
          accessClass: updated.accessClass,
          status: updated.status,
        },
      });

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'identity.member.seat.revoked.v1',
        aggregateType: 'organization_member',
        aggregateId: membershipId,
        payload: {
          organizationMemberId: membershipId,
          accessClass: existing.accessClass,
        },
      });

      return updated;
    });
  }

  private async getStaff(organizationId: string, id: string) {
    const rows = await this.database.db
      .select()
      .from(staffProfiles)
      .where(
        and(
          eq(staffProfiles.organizationId, organizationId),
          eq(staffProfiles.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Staff profile not found.');
    return rows[0];
  }

  private async getMember(organizationId: string, membershipId: string) {
    const rows = await this.database.db
      .select({
        id: organizationMembers.id,
        status: organizationMembers.status,
        isOwner: organizationMembers.isOwner,
      })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.id, membershipId),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException('Organization membership not found.');
    }
    return rows[0];
  }

  private async assertMembership(
    organizationId: string,
    membershipId?: string,
  ) {
    if (!membershipId) return;
    await this.getMember(organizationId, membershipId);
  }

  private async resolveWorkspace(
    organizationId: string,
    workspaceId?: string,
  ) {
    if (workspaceId) {
      const rows = await this.database.db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(
          and(
            eq(workspaces.organizationId, organizationId),
            eq(workspaces.id, workspaceId),
          ),
        )
        .limit(1);
      if (!rows[0]) throw new NotFoundException('Workspace not found.');
      return rows[0].id;
    }

    const rows = await this.database.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.organizationId, organizationId))
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Workspace not found.');
    return rows[0].id;
  }

  private async assertBranch(
    organizationId: string,
    workspaceId: string,
    branchId?: string,
  ) {
    if (!branchId) return;
    const rows = await this.database.db
      .select({ id: branches.id })
      .from(branches)
      .where(
        and(
          eq(branches.organizationId, organizationId),
          eq(branches.workspaceId, workspaceId),
          eq(branches.id, branchId),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException('Branch not found in this workspace.');
    }
  }

  private readSeatLimit(
    rows: Array<{
      key: string;
      enabled: boolean;
      limitValue: number | null;
    }>,
    accessClass: AccessClass,
  ): number | null {
    const keyByClass: Record<AccessClass, string> = {
      FULL: 'seats.full.max',
      LIGHT: 'seats.light.max',
      ATTENDANCE_ONLY: 'seats.attendance.max',
      GUEST: 'seats.guest.max',
    };
    const direct = rows.find((row) => row.key === keyByClass[accessClass]);
    if (direct) {
      if (!direct.enabled) return 0;
      return direct.limitValue ?? null;
    }

    if (accessClass === 'FULL') {
      const legacy = rows.find((row) => row.key === 'users.max');
      if (legacy) return legacy.enabled ? (legacy.limitValue ?? null) : 0;
    }

    if (accessClass === 'ATTENDANCE_ONLY' || accessClass === 'GUEST') {
      return null;
    }

    return 0;
  }
}
