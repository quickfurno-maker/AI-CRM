import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  auditLogs,
  branches,
  organizationMembers,
  outboxEvents,
  workspaces,
} from '../../platform/database/schema.js';
import { EntitlementsService } from '../../platform/entitlements/entitlements.service.js';
import { staffProfiles } from '../../modules/staff/staff.schema.js';
import type {
  AdminPunchDto,
  AssignShiftDto,
  AttendanceListQueryDto,
  AttendanceReportQueryDto,
  CreateAttendancePolicyDto,
  CreateDepartmentDto,
  CreateEmployeeDto,
  CreateHolidayDto,
  CreateLeaveRequestDto,
  CreateShiftDto,
  DecideLeaveDto,
  PunchDto,
  ReconcileAttendanceDto,
  UpdateAttendancePolicyDto,
  UpdateEmployeeDto,
} from './dto/attendance.dto.js';
import {
  attendanceDepartments,
  attendanceEmployees,
  attendanceEvents,
  attendanceHolidays,
  attendanceLeaveRequests,
  attendancePolicies,
  attendanceRecords,
  attendanceShiftAssignments,
  attendanceShifts,
} from './attendance.schema.js';

type PunchKind = 'CHECK_IN' | 'CHECK_OUT';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async dashboard(principal: Principal, date?: string) {
    await this.assertEnabled(principal);
    const attendanceDate = date ?? this.localDate(new Date(), 'Asia/Kolkata');

    const [employees, records, pendingLeaveRows] = await Promise.all([
      this.database.db
        .select({ id: attendanceEmployees.id })
        .from(attendanceEmployees)
        .where(
          and(
            eq(attendanceEmployees.organizationId, principal.organizationId),
            eq(attendanceEmployees.status, 'ACTIVE'),
          ),
        ),
      this.database.db
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.organizationId, principal.organizationId),
            eq(attendanceRecords.attendanceDate, attendanceDate),
          ),
        ),
      this.database.db
        .select({ value: count() })
        .from(attendanceLeaveRequests)
        .where(
          and(
            eq(
              attendanceLeaveRequests.organizationId,
              principal.organizationId,
            ),
            eq(attendanceLeaveRequests.status, 'PENDING'),
          ),
        ),
    ]);

    const byStatus = new Map<string, number>();
    for (const record of records) {
      byStatus.set(record.status, (byStatus.get(record.status) ?? 0) + 1);
    }

    return {
      date: attendanceDate,
      employees: employees.length,
      present:
        (byStatus.get('PRESENT') ?? 0) + (byStatus.get('PARTIAL') ?? 0),
      late: records.filter((record) => record.lateMinutes > 0).length,
      checkedIn: records.filter(
        (record) => record.firstCheckInAt && !record.lastCheckOutAt,
      ).length,
      absent: byStatus.get('ABSENT') ?? 0,
      onLeave: byStatus.get('LEAVE') ?? 0,
      holiday: byStatus.get('HOLIDAY') ?? 0,
      weekOff: byStatus.get('WEEK_OFF') ?? 0,
      notMarked: Math.max(0, employees.length - records.length),
      pendingLeaveApprovals: Number(pendingLeaveRows[0]?.value ?? 0),
    };
  }

  async listDepartments(
    principal: Principal,
    query: AttendanceListQueryDto,
  ) {
    await this.assertEnabled(principal);
    let rows = await this.database.db
      .select({
        department: attendanceDepartments,
        branchName: branches.name,
      })
      .from(attendanceDepartments)
      .leftJoin(branches, eq(branches.id, attendanceDepartments.branchId))
      .where(
        eq(attendanceDepartments.organizationId, principal.organizationId),
      )
      .orderBy(attendanceDepartments.name)
      .limit(query.limit);

    if (query.branchId) {
      rows = rows.filter(
        (row) => row.department.branchId === query.branchId,
      );
    }
    if (query.status) {
      rows = rows.filter(
        (row) => row.department.status === query.status,
      );
    }
    if (query.search) {
      const needle = query.search.trim().toLowerCase();
      rows = rows.filter((row) =>
        [row.department.name, row.department.code, row.branchName].some(
          (value) => value?.toLowerCase().includes(needle),
        ),
      );
    }
    return rows;
  }

  async createDepartment(
    principal: Principal,
    dto: CreateDepartmentDto,
  ) {
    await this.assertEnabled(principal);
    const branch = dto.branchId
      ? await this.resolveBranch(principal, dto.branchId)
      : undefined;
    const workspaceId = dto.workspaceId
      ? await this.resolveWorkspace(principal, dto.workspaceId)
      : branch?.workspaceId ?? await this.resolveWorkspace(principal);
    if (branch && branch.workspaceId !== workspaceId) {
      throw new BadRequestException(
        'Department workspace must match its branch.',
      );
    }
    if (dto.managerMemberId) {
      await this.resolveMember(principal, dto.managerMemberId);
    }

    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(attendanceDepartments)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          branchId: dto.branchId,
          managerMemberId: dto.managerMemberId,
          name: dto.name.trim(),
          code: dto.code?.trim(),
          metadata: dto.metadata,
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'attendance.department.created.v1',
        aggregateType: 'attendance_department',
        aggregateId: row.id,
        payload: {
          departmentId: row.id,
          workspaceId,
          branchId: row.branchId,
        },
      });
      await this.audit(
        tx,
        principal,
        workspaceId,
        'attendance.department.create',
        'attendance_department',
        row.id,
        row,
      );
      return row;
    });
  }

  async listEmployees(principal: Principal, query: AttendanceListQueryDto) {
    await this.assertEnabled(principal);
    let rows = await this.database.db
      .select({
        employee: attendanceEmployees,
        departmentName: attendanceDepartments.name,
        branchName: branches.name,
      })
      .from(attendanceEmployees)
      .leftJoin(
        attendanceDepartments,
        eq(attendanceDepartments.id, attendanceEmployees.departmentId),
      )
      .leftJoin(branches, eq(branches.id, attendanceEmployees.branchId))
      .where(eq(attendanceEmployees.organizationId, principal.organizationId))
      .orderBy(attendanceEmployees.displayName)
      .limit(query.limit);

    if (query.branchId) {
      rows = rows.filter((row) => row.employee.branchId === query.branchId);
    }
    if (query.departmentId) {
      rows = rows.filter(
        (row) => row.employee.departmentId === query.departmentId,
      );
    }
    if (query.status) {
      rows = rows.filter((row) => row.employee.status === query.status);
    }
    if (query.search) {
      const needle = query.search.trim().toLowerCase();
      rows = rows.filter((row) =>
        [
          row.employee.displayName,
          row.employee.employeeCode,
          row.employee.email,
          row.employee.phone,
          row.employee.designation,
          row.departmentName,
          row.branchName,
        ].some((value) => value?.toLowerCase().includes(needle)),
      );
    }
    return rows;
  }

  async createEmployee(principal: Principal, dto: CreateEmployeeDto) {
    await this.assertEnabled(principal);

    const employeeCode = dto.employeeCode.trim();
    const linkedStaffRows = dto.staffProfileId
      ? await this.database.db
          .select()
          .from(staffProfiles)
          .where(
            and(
              eq(staffProfiles.organizationId, principal.organizationId),
              eq(staffProfiles.id, dto.staffProfileId),
            ),
          )
          .limit(1)
      : dto.organizationMemberId
        ? await this.database.db
            .select()
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
            .limit(1)
        : await this.database.db
            .select()
            .from(staffProfiles)
            .where(
              and(
                eq(staffProfiles.organizationId, principal.organizationId),
                eq(staffProfiles.employeeCode, employeeCode),
              ),
            )
            .limit(1);
    const linkedStaff = linkedStaffRows[0];

    if (dto.staffProfileId && !linkedStaff) {
      throw new NotFoundException('Staff profile not found.');
    }
    if (linkedStaff && linkedStaff.employeeCode !== employeeCode) {
      throw new BadRequestException(
        'Attendance employee code must match the linked staff profile.',
      );
    }

    const branch = dto.branchId
      ? await this.resolveBranch(principal, dto.branchId)
      : linkedStaff?.branchId
        ? await this.resolveBranch(principal, linkedStaff.branchId)
        : undefined;
    const department = dto.departmentId
      ? await this.getDepartment(principal, dto.departmentId)
      : undefined;
    const workspaceId = dto.workspaceId
      ? await this.resolveWorkspace(principal, dto.workspaceId)
      : linkedStaff?.workspaceId ??
        department?.workspaceId ??
        branch?.workspaceId ??
        await this.resolveWorkspace(principal);

    if (linkedStaff && linkedStaff.workspaceId !== workspaceId) {
      throw new BadRequestException(
        'Attendance profile must use the linked staff workspace.',
      );
    }
    if (branch && branch.workspaceId !== workspaceId) {
      throw new BadRequestException('Employee workspace must match branch.');
    }
    if (
      department &&
      (department.workspaceId !== workspaceId ||
        (department.branchId &&
          branch &&
          department.branchId !== branch.id))
    ) {
      throw new BadRequestException(
        'Employee department does not belong to the selected workspace/branch.',
      );
    }

    const organizationMemberId =
      dto.organizationMemberId ?? linkedStaff?.organizationMemberId ?? undefined;
    const managerMemberId =
      dto.managerMemberId ?? linkedStaff?.managerMemberId ?? undefined;
    if (organizationMemberId) {
      await this.resolveMember(principal, organizationMemberId);
    }
    if (managerMemberId) {
      await this.resolveMember(principal, managerMemberId);
    }

    const effectiveBranchId =
      dto.branchId ?? department?.branchId ?? linkedStaff?.branchId ?? undefined;

    return this.database.db.transaction(async (tx) => {
      const [staffProfile] = linkedStaff
        ? await tx
            .update(staffProfiles)
            .set({
              branchId: effectiveBranchId,
              organizationMemberId,
              managerMemberId,
              displayName: dto.displayName.trim(),
              email: dto.email?.trim().toLowerCase() ?? linkedStaff.email,
              phone: dto.phone?.trim() ?? linkedStaff.phone,
              designation:
                dto.designation?.trim() ?? linkedStaff.designation,
              department: department?.name ?? linkedStaff.department,
              employmentType:
                dto.employmentType ?? linkedStaff.employmentType,
              joiningDate: dto.joiningDate ?? linkedStaff.joiningDate,
              metadata: dto.metadata ?? linkedStaff.metadata,
              updatedAt: new Date(),
            })
            .where(eq(staffProfiles.id, linkedStaff.id))
            .returning()
        : await tx
            .insert(staffProfiles)
            .values({
              organizationId: principal.organizationId,
              workspaceId,
              branchId: effectiveBranchId,
              organizationMemberId,
              managerMemberId,
              employeeCode,
              displayName: dto.displayName.trim(),
              email: dto.email?.trim().toLowerCase(),
              phone: dto.phone?.trim(),
              designation: dto.designation?.trim(),
              department: department?.name,
              employmentType: dto.employmentType ?? 'FULL_TIME',
              joiningDate: dto.joiningDate,
              metadata: dto.metadata,
            })
            .returning();

      const [row] = await tx
        .insert(attendanceEmployees)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          branchId: effectiveBranchId,
          departmentId: dto.departmentId,
          staffProfileId: staffProfile.id,
          organizationMemberId,
          managerMemberId,
          employeeCode,
          displayName: dto.displayName.trim(),
          email: dto.email?.trim().toLowerCase(),
          phone: dto.phone?.trim(),
          designation: dto.designation?.trim(),
          employmentType: dto.employmentType ?? 'FULL_TIME',
          joiningDate: dto.joiningDate,
          metadata: dto.metadata,
        })
        .returning();

      await tx.insert(outboxEvents).values([
        {
          organizationId: principal.organizationId,
          eventType: linkedStaff
            ? 'identity.staff.attendance_enabled.v1'
            : 'identity.staff.created.v1',
          aggregateType: 'staff_profile',
          aggregateId: staffProfile.id,
          payload: {
            staffProfileId: staffProfile.id,
            attendanceEmployeeId: row.id,
            seatAssigned: false,
          },
        },
        {
          organizationId: principal.organizationId,
          eventType: 'attendance.employee.created.v1',
          aggregateType: 'attendance_employee',
          aggregateId: row.id,
          payload: {
            employeeId: row.id,
            staffProfileId: row.staffProfileId,
            branchId: row.branchId,
            departmentId: row.departmentId,
            organizationMemberId: row.organizationMemberId,
          },
        },
      ]);
      await this.audit(
        tx,
        principal,
        workspaceId,
        'attendance.employee.create',
        'attendance_employee',
        row.id,
        row,
      );
      return row;
    });
  }

  async updateEmployee(
    principal: Principal,
    id: string,
    dto: UpdateEmployeeDto,
  ) {
    await this.assertEnabled(principal);
    const before = await this.getEmployee(principal, id);
    const branch = dto.branchId
      ? await this.resolveBranch(principal, dto.branchId)
      : before.branchId
        ? await this.resolveBranch(principal, before.branchId)
        : undefined;
    const department = dto.departmentId
      ? await this.getDepartment(principal, dto.departmentId)
      : before.departmentId
        ? await this.getDepartment(principal, before.departmentId)
        : undefined;

    if (branch && branch.workspaceId !== before.workspaceId) {
      throw new BadRequestException(
        'Employee cannot be moved to a branch in another workspace.',
      );
    }
    if (department && department.workspaceId !== before.workspaceId) {
      throw new BadRequestException(
        'Employee cannot be moved to a department in another workspace.',
      );
    }
    if (
      branch &&
      department?.branchId &&
      department.branchId !== branch.id
    ) {
      throw new BadRequestException(
        'Department does not belong to selected branch.',
      );
    }
    if (!branch && department?.branchId && dto.departmentId) {
      throw new BadRequestException(
        'A branch-specific department requires the employee to use the same branch.',
      );
    }
    if (dto.managerMemberId) {
      await this.resolveMember(principal, dto.managerMemberId);
    }
    const exitDate = dto.exitDate ?? before.exitDate ?? undefined;
    if (exitDate && before.joiningDate && exitDate < before.joiningDate) {
      throw new BadRequestException(
        'Employee exit date cannot be before joining date.',
      );
    }
    if (dto.status === 'EXITED' && !exitDate) {
      throw new BadRequestException(
        'Exited employees require an exit date.',
      );
    }

    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(attendanceEmployees)
        .set({
          branchId: dto.branchId,
          departmentId: dto.departmentId,
          managerMemberId: dto.managerMemberId,
          displayName: dto.displayName?.trim(),
          email: dto.email?.trim().toLowerCase(),
          phone: dto.phone?.trim(),
          designation: dto.designation?.trim(),
          employmentType: dto.employmentType,
          status: dto.status,
          exitDate: dto.exitDate,
          metadata: dto.metadata,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(attendanceEmployees.organizationId, principal.organizationId),
            eq(attendanceEmployees.id, id),
          ),
        )
        .returning();

      if (row.staffProfileId) {
        await tx
          .update(staffProfiles)
          .set({
            branchId: row.branchId,
            managerMemberId: row.managerMemberId,
            displayName: row.displayName,
            email: row.email,
            phone: row.phone,
            designation: row.designation,
            department: department?.name,
            employmentType: row.employmentType,
            status: row.status,
            exitDate: row.exitDate,
            metadata: row.metadata,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(staffProfiles.organizationId, principal.organizationId),
              eq(staffProfiles.id, row.staffProfileId),
            ),
          );
      }

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'attendance.employee.updated.v1',
        aggregateType: 'attendance_employee',
        aggregateId: row.id,
        payload: {
          employeeId: row.id,
          staffProfileId: row.staffProfileId,
          status: row.status,
          branchId: row.branchId,
          departmentId: row.departmentId,
        },
      });
      await this.audit(
        tx,
        principal,
        row.workspaceId,
        'attendance.employee.update',
        'attendance_employee',
        row.id,
        row,
        before,
      );
      return row;
    });
  }

  async listShifts(principal: Principal, query: AttendanceListQueryDto) {
    await this.assertEnabled(principal);
    let rows = await this.database.db
      .select({
        shift: attendanceShifts,
        branchName: branches.name,
      })
      .from(attendanceShifts)
      .leftJoin(branches, eq(branches.id, attendanceShifts.branchId))
      .where(eq(attendanceShifts.organizationId, principal.organizationId))
      .orderBy(attendanceShifts.name)
      .limit(query.limit);
    if (query.branchId) {
      rows = rows.filter((row) => row.shift.branchId === query.branchId);
    }
    if (query.status) {
      const active = query.status.toUpperCase() === 'ACTIVE';
      rows = rows.filter((row) => row.shift.isActive === active);
    }
    return rows;
  }

  async createShift(principal: Principal, dto: CreateShiftDto) {
    await this.assertEnabled(principal);
    const branch = dto.branchId
      ? await this.resolveBranch(principal, dto.branchId)
      : undefined;
    const workspaceId = dto.workspaceId
      ? await this.resolveWorkspace(principal, dto.workspaceId)
      : branch?.workspaceId ?? await this.resolveWorkspace(principal);
    if (branch && branch.workspaceId !== workspaceId) {
      throw new BadRequestException('Shift workspace must match branch.');
    }

    const maximumExpectedMinutes =
      this.calculateExpectedShiftMinutes(
        dto.startTime,
        dto.endTime,
        dto.breakMinutes ?? 0,
      );
    const expectedMinutes = dto.expectedMinutes ?? maximumExpectedMinutes;
    if (expectedMinutes > maximumExpectedMinutes) {
      throw new BadRequestException(
        'Expected shift minutes cannot exceed the scheduled shift duration after breaks.',
      );
    }

    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(attendanceShifts)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          branchId: dto.branchId,
          name: dto.name.trim(),
          code: dto.code.trim(),
          timezone: dto.timezone ?? 'Asia/Kolkata',
          startTime: this.normalizeTime(dto.startTime),
          endTime: this.normalizeTime(dto.endTime),
          breakMinutes: dto.breakMinutes ?? 0,
          graceMinutes: dto.graceMinutes ?? 0,
          expectedMinutes,
          weeklyOffDays: [...new Set(dto.weeklyOffDays ?? [])].sort((a, b) => a - b),
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'attendance.shift.created.v1',
        aggregateType: 'attendance_shift',
        aggregateId: row.id,
        payload: {
          shiftId: row.id,
          branchId: row.branchId,
          timezone: row.timezone,
        },
      });
      await this.audit(
        tx,
        principal,
        workspaceId,
        'attendance.shift.create',
        'attendance_shift',
        row.id,
        row,
      );
      return row;
    });
  }

  async assignShift(principal: Principal, dto: AssignShiftDto) {
    await this.assertEnabled(principal);
    const employee = await this.getEmployee(principal, dto.employeeId);
    const shift = await this.getShift(principal, dto.shiftId);
    if (employee.workspaceId !== shift.workspaceId) {
      throw new BadRequestException(
        'Employee and shift must belong to the same workspace.',
      );
    }
    if (
      employee.branchId &&
      shift.branchId &&
      employee.branchId !== shift.branchId
    ) {
      throw new BadRequestException(
        'Employee and shift must belong to the same branch.',
      );
    }
    this.assertDateOrder(dto.effectiveFrom, dto.effectiveTo);

    const upper = dto.effectiveTo ?? '9999-12-31';

    return this.database.db.transaction(async (tx) => {
      await tx
        .update(attendanceEmployees)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(attendanceEmployees.organizationId, principal.organizationId),
            eq(attendanceEmployees.id, dto.employeeId),
          ),
        );

      const overlaps = await tx
        .select({ id: attendanceShiftAssignments.id })
        .from(attendanceShiftAssignments)
        .where(
          and(
            eq(
              attendanceShiftAssignments.organizationId,
              principal.organizationId,
            ),
            eq(attendanceShiftAssignments.employeeId, dto.employeeId),
            lte(attendanceShiftAssignments.effectiveFrom, upper),
            or(
              isNull(attendanceShiftAssignments.effectiveTo),
              gte(
                attendanceShiftAssignments.effectiveTo,
                dto.effectiveFrom,
              ),
            ),
          ),
        )
        .limit(1);
      if (overlaps.length) {
        throw new ConflictException(
          'Employee already has a shift assignment in this date range.',
        );
      }

      const [row] = await tx
        .insert(attendanceShiftAssignments)
        .values({
          organizationId: principal.organizationId,
          employeeId: dto.employeeId,
          shiftId: dto.shiftId,
          effectiveFrom: dto.effectiveFrom,
          effectiveTo: dto.effectiveTo,
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'attendance.shift.assigned.v1',
        aggregateType: 'attendance_shift_assignment',
        aggregateId: row.id,
        payload: {
          employeeId: row.employeeId,
          shiftId: row.shiftId,
          effectiveFrom: row.effectiveFrom,
          effectiveTo: row.effectiveTo,
        },
      });
      await this.audit(
        tx,
        principal,
        employee.workspaceId,
        'attendance.shift.assign',
        'attendance_shift_assignment',
        row.id,
        row,
      );
      return row;
    });
  }

  async listPolicies(principal: Principal, query: AttendanceListQueryDto) {
    await this.assertEnabled(principal);
    let rows = await this.database.db
      .select({
        policy: attendancePolicies,
        branchName: branches.name,
      })
      .from(attendancePolicies)
      .leftJoin(branches, eq(branches.id, attendancePolicies.branchId))
      .where(eq(attendancePolicies.organizationId, principal.organizationId))
      .orderBy(desc(attendancePolicies.isDefault), attendancePolicies.name)
      .limit(query.limit);
    if (query.branchId) {
      rows = rows.filter((row) => row.policy.branchId === query.branchId);
    }
    if (query.status) {
      rows = rows.filter((row) => row.policy.status === query.status);
    }
    return rows;
  }

  async createPolicy(
    principal: Principal,
    dto: CreateAttendancePolicyDto,
  ) {
    await this.assertEnabled(principal);
    const branch = dto.branchId
      ? await this.resolveBranch(principal, dto.branchId)
      : undefined;
    const workspaceId = dto.workspaceId
      ? await this.resolveWorkspace(principal, dto.workspaceId)
      : branch?.workspaceId ?? await this.resolveWorkspace(principal);
    if (branch && branch.workspaceId !== workspaceId) {
      throw new BadRequestException('Policy workspace must match branch.');
    }
    this.validateLocationPolicy(dto);

    return this.database.db.transaction(async (tx) => {
      if (dto.isDefault) {
        await tx
          .update(attendancePolicies)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(attendancePolicies.organizationId, principal.organizationId),
              eq(attendancePolicies.workspaceId, workspaceId),
              dto.branchId
                ? eq(attendancePolicies.branchId, dto.branchId)
                : isNull(attendancePolicies.branchId),
            ),
          );
      }
      const [row] = await tx
        .insert(attendancePolicies)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          branchId: dto.branchId,
          name: dto.name.trim(),
          isDefault: dto.isDefault ?? false,
          locationValidationMode: dto.locationValidationMode ?? 'NONE',
          latitude: dto.latitude,
          longitude: dto.longitude,
          radiusMeters: dto.radiusMeters,
          maxAccuracyMeters: dto.maxAccuracyMeters ?? 100,
          allowRemote: dto.allowRemote ?? false,
          lateGraceMinutes: dto.lateGraceMinutes ?? 0,
          earlyExitGraceMinutes: dto.earlyExitGraceMinutes ?? 0,
          maxShiftHours: dto.maxShiftHours ?? 16,
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'attendance.policy.created.v1',
        aggregateType: 'attendance_policy',
        aggregateId: row.id,
        payload: {
          policyId: row.id,
          branchId: row.branchId,
          locationValidationMode: row.locationValidationMode,
          isDefault: row.isDefault,
        },
      });
      await this.audit(
        tx,
        principal,
        workspaceId,
        'attendance.policy.create',
        'attendance_policy',
        row.id,
        row,
      );
      return row;
    });
  }

  async updatePolicy(
    principal: Principal,
    id: string,
    dto: UpdateAttendancePolicyDto,
  ) {
    await this.assertEnabled(principal);
    const before = await this.getPolicy(principal, id);
    this.validateLocationPolicy({
      locationValidationMode:
        dto.locationValidationMode ?? before.locationValidationMode,
      latitude: dto.latitude ?? before.latitude ?? undefined,
      longitude: dto.longitude ?? before.longitude ?? undefined,
      radiusMeters: dto.radiusMeters ?? before.radiusMeters ?? undefined,
      maxAccuracyMeters:
        dto.maxAccuracyMeters ?? before.maxAccuracyMeters ?? undefined,
    });

    return this.database.db.transaction(async (tx) => {
      if (dto.isDefault) {
        await tx
          .update(attendancePolicies)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(attendancePolicies.organizationId, principal.organizationId),
              eq(attendancePolicies.workspaceId, before.workspaceId),
              before.branchId
                ? eq(attendancePolicies.branchId, before.branchId)
                : isNull(attendancePolicies.branchId),
            ),
          );
      }

      const [row] = await tx
        .update(attendancePolicies)
        .set({
          name: dto.name?.trim(),
          isDefault: dto.isDefault,
          locationValidationMode: dto.locationValidationMode,
          latitude: dto.latitude,
          longitude: dto.longitude,
          radiusMeters: dto.radiusMeters,
          maxAccuracyMeters: dto.maxAccuracyMeters,
          allowRemote: dto.allowRemote,
          lateGraceMinutes: dto.lateGraceMinutes,
          earlyExitGraceMinutes: dto.earlyExitGraceMinutes,
          maxShiftHours: dto.maxShiftHours,
          status: dto.status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(attendancePolicies.organizationId, principal.organizationId),
            eq(attendancePolicies.id, id),
          ),
        )
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'attendance.policy.updated.v1',
        aggregateType: 'attendance_policy',
        aggregateId: row.id,
        payload: {
          policyId: row.id,
          status: row.status,
          locationValidationMode: row.locationValidationMode,
          isDefault: row.isDefault,
        },
      });
      await this.audit(
        tx,
        principal,
        row.workspaceId,
        'attendance.policy.update',
        'attendance_policy',
        row.id,
        row,
        before,
      );
      return row;
    });
  }

  async listHolidays(principal: Principal, query: AttendanceListQueryDto) {
    await this.assertEnabled(principal);
    let rows = await this.database.db
      .select({
        holiday: attendanceHolidays,
        branchName: branches.name,
      })
      .from(attendanceHolidays)
      .leftJoin(branches, eq(branches.id, attendanceHolidays.branchId))
      .where(eq(attendanceHolidays.organizationId, principal.organizationId))
      .orderBy(desc(attendanceHolidays.holidayDate))
      .limit(query.limit);

    if (query.branchId) {
      rows = rows.filter((row) => row.holiday.branchId === query.branchId);
    }
    if (query.from) {
      rows = rows.filter((row) => row.holiday.holidayDate >= query.from!);
    }
    if (query.to) {
      rows = rows.filter((row) => row.holiday.holidayDate <= query.to!);
    }
    return rows;
  }

  async createHoliday(principal: Principal, dto: CreateHolidayDto) {
    await this.assertEnabled(principal);
    const branch = dto.branchId
      ? await this.resolveBranch(principal, dto.branchId)
      : undefined;
    const workspaceId = dto.workspaceId
      ? await this.resolveWorkspace(principal, dto.workspaceId)
      : branch?.workspaceId ?? await this.resolveWorkspace(principal);
    if (branch && branch.workspaceId !== workspaceId) {
      throw new BadRequestException('Holiday workspace must match branch.');
    }

    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(attendanceHolidays)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          branchId: dto.branchId,
          holidayDate: dto.holidayDate,
          name: dto.name.trim(),
          holidayType: dto.holidayType ?? 'COMPANY',
          isPaid: dto.isPaid ?? true,
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'attendance.holiday.created.v1',
        aggregateType: 'attendance_holiday',
        aggregateId: row.id,
        payload: {
          holidayId: row.id,
          date: row.holidayDate,
          branchId: row.branchId,
        },
      });
      await this.audit(
        tx,
        principal,
        workspaceId,
        'attendance.holiday.create',
        'attendance_holiday',
        row.id,
        row,
      );
      return row;
    });
  }

  async listRecords(principal: Principal, query: AttendanceListQueryDto) {
    await this.assertEnabled(principal);
    let rows = await this.database.db
      .select({
        record: attendanceRecords,
        employee: attendanceEmployees,
        shiftName: attendanceShifts.name,
        branchName: branches.name,
        departmentName: attendanceDepartments.name,
      })
      .from(attendanceRecords)
      .innerJoin(
        attendanceEmployees,
        eq(attendanceEmployees.id, attendanceRecords.employeeId),
      )
      .leftJoin(
        attendanceShifts,
        eq(attendanceShifts.id, attendanceRecords.shiftId),
      )
      .leftJoin(branches, eq(branches.id, attendanceEmployees.branchId))
      .leftJoin(
        attendanceDepartments,
        eq(attendanceDepartments.id, attendanceEmployees.departmentId),
      )
      .where(eq(attendanceRecords.organizationId, principal.organizationId))
      .orderBy(
        desc(attendanceRecords.attendanceDate),
        attendanceEmployees.displayName,
      )
      .limit(query.limit);

    if (query.employeeId) {
      rows = rows.filter(
        (row) => row.record.employeeId === query.employeeId,
      );
    }
    if (query.branchId) {
      rows = rows.filter(
        (row) => row.employee.branchId === query.branchId,
      );
    }
    if (query.departmentId) {
      rows = rows.filter(
        (row) => row.employee.departmentId === query.departmentId,
      );
    }
    if (query.status) {
      rows = rows.filter((row) => row.record.status === query.status);
    }
    if (query.date) {
      rows = rows.filter(
        (row) => row.record.attendanceDate === query.date,
      );
    }
    if (query.from) {
      rows = rows.filter(
        (row) => row.record.attendanceDate >= query.from!,
      );
    }
    if (query.to) {
      rows = rows.filter((row) => row.record.attendanceDate <= query.to!);
    }
    return rows;
  }

  async listEvents(principal: Principal, query: AttendanceListQueryDto) {
    await this.assertEnabled(principal);
    let rows = await this.database.db
      .select({
        event: attendanceEvents,
        employeeName: attendanceEmployees.displayName,
        employeeCode: attendanceEmployees.employeeCode,
      })
      .from(attendanceEvents)
      .innerJoin(
        attendanceEmployees,
        eq(attendanceEmployees.id, attendanceEvents.employeeId),
      )
      .where(eq(attendanceEvents.organizationId, principal.organizationId))
      .orderBy(desc(attendanceEvents.occurredAt))
      .limit(query.limit);

    if (query.employeeId) {
      rows = rows.filter(
        (row) => row.event.employeeId === query.employeeId,
      );
    }
    return rows;
  }

  async punchSelf(
    principal: Principal,
    kind: PunchKind,
    dto: PunchDto,
  ) {
    await this.assertEnabled(principal);
    const employee = await this.getEmployeeForMember(
      principal,
      principal.membershipId,
    );
    return this.punch(principal, employee, kind, dto, false);
  }

  async punchEmployee(
    principal: Principal,
    employeeId: string,
    kind: PunchKind,
    dto: AdminPunchDto,
  ) {
    await this.assertEnabled(principal);
    const employee = await this.getEmployee(principal, employeeId);
    return this.punch(principal, employee, kind, dto, true);
  }

  private async punch(
    principal: Principal,
    employee: typeof attendanceEmployees.$inferSelect,
    kind: PunchKind,
    dto: PunchDto & { occurredAt?: string },
    isAdmin: boolean,
  ) {
    if (employee.status !== 'ACTIVE') {
      throw new ConflictException('Employee is not active.');
    }

    if (dto.idempotencyKey) {
      const existing = await this.database.db
        .select()
        .from(attendanceEvents)
        .where(
          and(
            eq(attendanceEvents.organizationId, principal.organizationId),
            eq(attendanceEvents.idempotencyKey, dto.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing[0]) {
        this.assertIdempotentPunchMatches(
          existing[0],
          employee.id,
          kind,
          isAdmin,
        );
        const record = existing[0].recordId
          ? await this.database.db
              .select()
              .from(attendanceRecords)
              .where(eq(attendanceRecords.id, existing[0].recordId))
              .limit(1)
          : [];
        return { event: existing[0], record: record[0], idempotent: true };
      }
    }

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('Invalid attendance event time.');
    }
    if (
      isAdmin &&
      occurredAt.getTime() > Date.now() + 5 * 60 * 1000
    ) {
      throw new BadRequestException(
        'Manager attendance corrections cannot be future-dated.',
      );
    }

    const timezone = await this.employeeTimezone(employee);
    let attendanceDate = this.localDate(occurredAt, timezone);
    let shift = await this.getShiftForEmployeeDate(
      principal,
      employee.id,
      attendanceDate,
    );

    if (kind === 'CHECK_IN') {
      const previousDate = this.addDays(attendanceDate, -1);
      const previousShift = await this.getShiftForEmployeeDate(
        principal,
        employee.id,
        previousDate,
      );
      if (
        previousShift &&
        this.isOvernightShift(previousShift) &&
        !previousShift.weeklyOffDays.includes(
          this.localWeekday(previousDate, previousShift.timezone),
        ) &&
        this.clockMinutes(occurredAt, previousShift.timezone) <=
          this.timeMinutes(previousShift.endTime)
      ) {
        attendanceDate = previousDate;
        shift = previousShift;
      }
    }
    const policy = await this.resolvePolicy(principal, employee);
    const location = isAdmin
      ? {
          status: 'ADMIN_OVERRIDE',
          distanceMeters: undefined as number | undefined,
        }
      : this.validatePunchLocation(policy, dto);
    const source = isAdmin ? 'ADMIN' : dto.source ?? 'WEB';

    try {
      return await this.database.db.transaction(async (tx) => {
        if (kind === 'CHECK_IN') {
          const existingRows = await tx
            .select()
            .from(attendanceRecords)
            .where(
              and(
                eq(
                  attendanceRecords.organizationId,
                  principal.organizationId,
                ),
                eq(attendanceRecords.employeeId, employee.id),
                eq(attendanceRecords.attendanceDate, attendanceDate),
              ),
            )
            .limit(1);
          const existing = existingRows[0];
          if (existing?.firstCheckInAt) {
            throw new ConflictException(
              'Employee already checked in for this attendance day.',
            );
          }

          const lateMinutes = shift
            ? Math.max(
                0,
                this.clockMinutes(occurredAt, shift.timezone) -
                  this.timeMinutes(shift.startTime) -
                  Math.max(
                    shift.graceMinutes,
                    policy?.lateGraceMinutes ?? 0,
                  ),
              )
            : 0;

          let record: typeof attendanceRecords.$inferSelect;
          if (existing) {
            [record] = await tx
              .update(attendanceRecords)
              .set({
                shiftId: shift?.id,
                status: 'PRESENT',
                firstCheckInAt: occurredAt,
                lastCheckOutAt: null,
                workMinutes: 0,
                lateMinutes,
                earlyExitMinutes: 0,
                overtimeMinutes: 0,
                source: 'EVENTS',
                updatedAt: new Date(),
              })
              .where(eq(attendanceRecords.id, existing.id))
              .returning();
          } else {
            [record] = await tx
              .insert(attendanceRecords)
              .values({
                organizationId: principal.organizationId,
                workspaceId: employee.workspaceId,
                employeeId: employee.id,
                shiftId: shift?.id,
                attendanceDate,
                status: 'PRESENT',
                firstCheckInAt: occurredAt,
                lateMinutes,
                source: 'EVENTS',
              })
              .returning();
          }

          const [event] = await tx
            .insert(attendanceEvents)
            .values({
              organizationId: principal.organizationId,
              workspaceId: employee.workspaceId,
              employeeId: employee.id,
              recordId: record.id,
              shiftId: shift?.id,
              branchId: employee.branchId,
              policyId: policy?.id,
              eventType: isAdmin ? 'MANUAL_IN' : 'CHECK_IN',
              occurredAt,
              source,
              latitude: dto.latitude,
              longitude: dto.longitude,
              accuracyMeters: dto.accuracyMeters,
              locationValidation: location.status,
              distanceMeters: location.distanceMeters,
              idempotencyKey: dto.idempotencyKey,
              actorType: principal.actorType ?? 'USER',
              actorId: principal.actorId ?? principal.userId,
            })
            .returning();

          await tx.insert(outboxEvents).values({
            organizationId: principal.organizationId,
            eventType: 'attendance.employee.checked_in.v1',
            aggregateType: 'attendance_record',
            aggregateId: record.id,
            payload: {
              employeeId: employee.id,
              recordId: record.id,
              eventId: event.id,
              attendanceDate,
              occurredAt,
              lateMinutes,
              locationValidation: location.status,
            },
          });
          await this.audit(
            tx,
            principal,
            employee.workspaceId,
            isAdmin
              ? 'attendance.employee.manual_check_in'
              : 'attendance.employee.check_in',
            'attendance_record',
            record.id,
            {
              ...record,
              eventId: event.id,
              locationValidation: location.status,
            },
            existing,
          );
          return { event, record, idempotent: false };
        }

        const openRows = await tx
          .select()
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.organizationId, principal.organizationId),
              eq(attendanceRecords.employeeId, employee.id),
              isNotNull(attendanceRecords.firstCheckInAt),
              isNull(attendanceRecords.lastCheckOutAt),
            ),
          )
          .orderBy(desc(attendanceRecords.attendanceDate))
          .limit(1);
        const open = openRows[0];
        if (!open?.firstCheckInAt) {
          throw new ConflictException(
            'Employee does not have an open attendance record.',
          );
        }
        if (occurredAt.getTime() <= open.firstCheckInAt.getTime()) {
          throw new BadRequestException(
            'Check-out must be after check-in.',
          );
        }

        const recordShift =
          open.shiftId && (!shift || shift.id !== open.shiftId)
            ? await this.getShift(principal, open.shiftId)
            : shift;
        const durationMinutes = Math.floor(
          (occurredAt.getTime() - open.firstCheckInAt.getTime()) / 60000,
        );
        const maxShiftHours = policy?.maxShiftHours ?? 16;
        if (!isAdmin && durationMinutes > maxShiftHours * 60) {
          throw new ConflictException(
            'Open attendance exceeds the allowed shift duration and requires manager correction.',
          );
        }
        const workMinutes = Math.max(
          0,
          durationMinutes -
            Math.min(recordShift?.breakMinutes ?? 0, durationMinutes),
        );

        let earlyExitMinutes = 0;
        let overtimeMinutes = 0;
        if (recordShift) {
          const start = this.timeMinutes(recordShift.startTime);
          let expectedEnd = this.timeMinutes(recordShift.endTime);
          if (expectedEnd <= start) expectedEnd += 1440;
          let checkoutClock = this.clockMinutes(
            occurredAt,
            recordShift.timezone,
          );
          if (checkoutClock < start) checkoutClock += 1440;
          const earlyGrace = policy?.earlyExitGraceMinutes ?? 0;
          earlyExitMinutes = Math.max(
            0,
            expectedEnd - checkoutClock - earlyGrace,
          );
          overtimeMinutes = Math.max(0, checkoutClock - expectedEnd);
        }

        const [record] = await tx
          .update(attendanceRecords)
          .set({
            lastCheckOutAt: occurredAt,
            workMinutes,
            earlyExitMinutes,
            overtimeMinutes,
            status: workMinutes > 0 ? 'PRESENT' : 'PARTIAL',
            updatedAt: new Date(),
          })
          .where(eq(attendanceRecords.id, open.id))
          .returning();

        const [event] = await tx
          .insert(attendanceEvents)
          .values({
            organizationId: principal.organizationId,
            workspaceId: employee.workspaceId,
            employeeId: employee.id,
            recordId: record.id,
            shiftId: recordShift?.id,
            branchId: employee.branchId,
            policyId: policy?.id,
            eventType: isAdmin ? 'MANUAL_OUT' : 'CHECK_OUT',
            occurredAt,
            source,
            latitude: dto.latitude,
            longitude: dto.longitude,
            accuracyMeters: dto.accuracyMeters,
            locationValidation: location.status,
            distanceMeters: location.distanceMeters,
            idempotencyKey: dto.idempotencyKey,
            actorType: principal.actorType ?? 'USER',
            actorId: principal.actorId ?? principal.userId,
          })
          .returning();

        await tx.insert(outboxEvents).values({
          organizationId: principal.organizationId,
          eventType: 'attendance.employee.checked_out.v1',
          aggregateType: 'attendance_record',
          aggregateId: record.id,
          payload: {
            employeeId: employee.id,
            recordId: record.id,
            eventId: event.id,
            attendanceDate: record.attendanceDate,
            occurredAt,
            workMinutes,
            earlyExitMinutes,
            overtimeMinutes,
            locationValidation: location.status,
          },
        });
        await this.audit(
          tx,
          principal,
          employee.workspaceId,
          isAdmin
            ? 'attendance.employee.manual_check_out'
            : 'attendance.employee.check_out',
          'attendance_record',
          record.id,
          {
            ...record,
            eventId: event.id,
            locationValidation: location.status,
          },
          open,
        );
        return { event, record, idempotent: false };
      });
    } catch (error) {
      if (
        dto.idempotencyKey &&
        this.isUniqueViolation(error)
      ) {
        const rows = await this.database.db
          .select()
          .from(attendanceEvents)
          .where(
            and(
              eq(attendanceEvents.organizationId, principal.organizationId),
              eq(attendanceEvents.idempotencyKey, dto.idempotencyKey),
            ),
          )
          .limit(1);
        if (rows[0]) {
          this.assertIdempotentPunchMatches(
            rows[0],
            employee.id,
            kind,
            isAdmin,
          );
          const record = rows[0].recordId
            ? await this.database.db
                .select()
                .from(attendanceRecords)
                .where(eq(attendanceRecords.id, rows[0].recordId))
                .limit(1)
            : [];
          return { event: rows[0], record: record[0], idempotent: true };
        }
      }
      throw error;
    }
  }

  async listLeaves(principal: Principal, query: AttendanceListQueryDto) {
    await this.assertEnabled(principal);
    let rows = await this.database.db
      .select({
        leave: attendanceLeaveRequests,
        employeeName: attendanceEmployees.displayName,
        employeeCode: attendanceEmployees.employeeCode,
        branchId: attendanceEmployees.branchId,
        departmentId: attendanceEmployees.departmentId,
      })
      .from(attendanceLeaveRequests)
      .innerJoin(
        attendanceEmployees,
        eq(attendanceEmployees.id, attendanceLeaveRequests.employeeId),
      )
      .where(
        eq(
          attendanceLeaveRequests.organizationId,
          principal.organizationId,
        ),
      )
      .orderBy(desc(attendanceLeaveRequests.createdAt))
      .limit(query.limit);

    if (query.employeeId) {
      rows = rows.filter(
        (row) => row.leave.employeeId === query.employeeId,
      );
    }
    if (query.branchId) {
      rows = rows.filter((row) => row.branchId === query.branchId);
    }
    if (query.departmentId) {
      rows = rows.filter(
        (row) => row.departmentId === query.departmentId,
      );
    }
    if (query.status) {
      rows = rows.filter((row) => row.leave.status === query.status);
    }
    return rows;
  }

  async createSelfLeave(
    principal: Principal,
    dto: CreateLeaveRequestDto,
  ) {
    const employee = await this.getEmployeeForMember(
      principal,
      principal.membershipId,
    );
    return this.createLeave(principal, employee.id, dto);
  }

  async createEmployeeLeave(
    principal: Principal,
    employeeId: string,
    dto: CreateLeaveRequestDto,
  ) {
    return this.createLeave(principal, employeeId, dto);
  }

  private async createLeave(
    principal: Principal,
    employeeId: string,
    dto: CreateLeaveRequestDto,
  ) {
    await this.assertEnabled(principal);
    const employee = await this.getEmployee(principal, employeeId);
    this.assertDateOrder(dto.startDate, dto.endDate);
    const calendarDays = this.inclusiveDays(
      dto.startDate,
      dto.endDate,
    );
    const requestedDays = dto.requestedDays ?? String(calendarDays);
    const requestedDaysNumber = Number(requestedDays);
    if (
      !Number.isFinite(requestedDaysNumber) ||
      requestedDaysNumber <= 0 ||
      requestedDaysNumber > calendarDays
    ) {
      throw new BadRequestException(
        'Requested leave days must be greater than zero and cannot exceed the selected calendar range.',
      );
    }

    return this.database.db.transaction(async (tx) => {
      await tx
        .update(attendanceEmployees)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(attendanceEmployees.organizationId, principal.organizationId),
            eq(attendanceEmployees.id, employee.id),
          ),
        );

      const overlap = await tx
        .select({ id: attendanceLeaveRequests.id })
        .from(attendanceLeaveRequests)
        .where(
          and(
            eq(
              attendanceLeaveRequests.organizationId,
              principal.organizationId,
            ),
            eq(attendanceLeaveRequests.employeeId, employee.id),
            lte(attendanceLeaveRequests.startDate, dto.endDate),
            gte(attendanceLeaveRequests.endDate, dto.startDate),
            or(
              eq(attendanceLeaveRequests.status, 'PENDING'),
              eq(attendanceLeaveRequests.status, 'APPROVED'),
            ),
          ),
        )
        .limit(1);
      if (overlap.length) {
        throw new ConflictException(
          'An overlapping pending or approved leave request already exists.',
        );
      }

      const [row] = await tx
        .insert(attendanceLeaveRequests)
        .values({
          organizationId: principal.organizationId,
          workspaceId: employee.workspaceId,
          employeeId: employee.id,
          leaveType: dto.leaveType.trim(),
          startDate: dto.startDate,
          endDate: dto.endDate,
          requestedDays,
          reason: dto.reason?.trim(),
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'attendance.leave.requested.v1',
        aggregateType: 'attendance_leave_request',
        aggregateId: row.id,
        payload: {
          leaveRequestId: row.id,
          employeeId: row.employeeId,
          startDate: row.startDate,
          endDate: row.endDate,
          leaveType: row.leaveType,
        },
      });
      await this.audit(
        tx,
        principal,
        employee.workspaceId,
        'attendance.leave.request',
        'attendance_leave_request',
        row.id,
        row,
      );
      return row;
    });
  }

  async decideLeave(
    principal: Principal,
    id: string,
    dto: DecideLeaveDto,
  ) {
    await this.assertEnabled(principal);
    const beforeRows = await this.database.db
      .select()
      .from(attendanceLeaveRequests)
      .where(
        and(
          eq(
            attendanceLeaveRequests.organizationId,
            principal.organizationId,
          ),
          eq(attendanceLeaveRequests.id, id),
        ),
      )
      .limit(1);
    const before = beforeRows[0];
    if (!before) throw new NotFoundException('Leave request not found.');
    if (before.status !== 'PENDING') {
      throw new ConflictException(
        'Only pending leave requests can be decided.',
      );
    }

    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(attendanceLeaveRequests)
        .set({
          status: dto.status,
          approverMemberId: principal.membershipId,
          decidedAt: new Date(),
          decisionNotes: dto.decisionNotes?.trim(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(
              attendanceLeaveRequests.organizationId,
              principal.organizationId,
            ),
            eq(attendanceLeaveRequests.id, id),
            eq(attendanceLeaveRequests.status, 'PENDING'),
          ),
        )
        .returning();
      if (!row) {
        throw new ConflictException('Leave request was already decided.');
      }
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType:
          dto.status === 'APPROVED'
            ? 'attendance.leave.approved.v1'
            : 'attendance.leave.rejected.v1',
        aggregateType: 'attendance_leave_request',
        aggregateId: row.id,
        payload: {
          leaveRequestId: row.id,
          employeeId: row.employeeId,
          status: row.status,
          approverMemberId: row.approverMemberId,
        },
      });
      await this.audit(
        tx,
        principal,
        row.workspaceId,
        'attendance.leave.decide',
        'attendance_leave_request',
        row.id,
        row,
        before,
      );
      return row;
    });
  }

  async reconcileDay(
    principal: Principal,
    dto: ReconcileAttendanceDto,
  ) {
    await this.assertEnabled(principal);
    if (dto.branchId) await this.resolveBranch(principal, dto.branchId);

    const employeeConditions = [
      eq(attendanceEmployees.organizationId, principal.organizationId),
      eq(attendanceEmployees.status, 'ACTIVE'),
    ];
    if (dto.branchId) {
      employeeConditions.push(
        eq(attendanceEmployees.branchId, dto.branchId),
      );
    }
    const employeeRows = await this.database.db
      .select({
        employee: attendanceEmployees,
        shift: attendanceShifts,
      })
      .from(attendanceEmployees)
      .leftJoin(
        attendanceShiftAssignments,
        and(
          eq(
            attendanceShiftAssignments.organizationId,
            principal.organizationId,
          ),
          eq(
            attendanceShiftAssignments.employeeId,
            attendanceEmployees.id,
          ),
          lte(attendanceShiftAssignments.effectiveFrom, dto.date),
          or(
            isNull(attendanceShiftAssignments.effectiveTo),
            gte(attendanceShiftAssignments.effectiveTo, dto.date),
          ),
        ),
      )
      .leftJoin(
        attendanceShifts,
        eq(attendanceShifts.id, attendanceShiftAssignments.shiftId),
      )
      .where(and(...employeeConditions));

    const existingRows = await this.database.db
      .select({ employeeId: attendanceRecords.employeeId })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.organizationId, principal.organizationId),
          eq(attendanceRecords.attendanceDate, dto.date),
        ),
      );
    const existing = new Set(existingRows.map((row) => row.employeeId));

    const leaveRows = await this.database.db
      .select({
        employeeId: attendanceLeaveRequests.employeeId,
      })
      .from(attendanceLeaveRequests)
      .where(
        and(
          eq(
            attendanceLeaveRequests.organizationId,
            principal.organizationId,
          ),
          eq(attendanceLeaveRequests.status, 'APPROVED'),
          lte(attendanceLeaveRequests.startDate, dto.date),
          gte(attendanceLeaveRequests.endDate, dto.date),
        ),
      );
    const onLeave = new Set(leaveRows.map((row) => row.employeeId));

    const holidayRows = await this.database.db
      .select()
      .from(attendanceHolidays)
      .where(
        and(
          eq(attendanceHolidays.organizationId, principal.organizationId),
          eq(attendanceHolidays.holidayDate, dto.date),
        ),
      );

    const candidates: Array<{
      employee: typeof attendanceEmployees.$inferSelect;
      shift: typeof attendanceShifts.$inferSelect | undefined;
      status: string;
    }> = [];

    for (const row of employeeRows) {
      const employee = row.employee;
      const shift = row.shift ?? undefined;
      if (existing.has(employee.id)) continue;
      const branchHoliday = holidayRows.some(
        (holiday) =>
          holiday.branchId === null ||
          holiday.branchId === employee.branchId,
      );
      const weekDay = this.localWeekday(
        dto.date,
        shift?.timezone ?? 'Asia/Kolkata',
      );

      let status = 'ABSENT';
      if (onLeave.has(employee.id)) status = 'LEAVE';
      else if (branchHoliday) status = 'HOLIDAY';
      else if (shift?.weeklyOffDays.includes(weekDay)) status = 'WEEK_OFF';

      candidates.push({ employee, shift, status });
    }

    const created = await this.database.db.transaction(async (tx) => {
      const rows: Array<typeof attendanceRecords.$inferSelect> = [];

      for (const candidate of candidates) {
        const [record] = await tx
          .insert(attendanceRecords)
          .values({
            organizationId: principal.organizationId,
            workspaceId: candidate.employee.workspaceId,
            employeeId: candidate.employee.id,
            shiftId: candidate.shift?.id,
            attendanceDate: dto.date,
            status: candidate.status,
            source: 'RECONCILIATION',
          })
          .onConflictDoNothing()
          .returning();
        if (record) rows.push(record);
      }

      if (!rows.length) return rows;

      const statuses = rows.reduce<Record<string, number>>(
        (acc, record) => {
          acc[record.status] = (acc[record.status] ?? 0) + 1;
          return acc;
        },
        {},
      );

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'attendance.day.reconciled.v1',
        aggregateType: 'attendance_day',
        aggregateId: dto.date,
        payload: {
          date: dto.date,
          branchId: dto.branchId,
          createdCount: rows.length,
          statuses,
        },
      });

      const byWorkspace = new Map<string, number>();
      for (const record of rows) {
        byWorkspace.set(
          record.workspaceId,
          (byWorkspace.get(record.workspaceId) ?? 0) + 1,
        );
      }
      for (const [workspaceId, createdCount] of byWorkspace) {
        await this.audit(
          tx,
          principal,
          workspaceId,
          'attendance.day.reconcile',
          'attendance_day',
          dto.date,
          {
            date: dto.date,
            branchId: dto.branchId,
            createdCount,
            statuses,
          },
        );
      }

      return rows;
    });

    return {
      date: dto.date,
      branchId: dto.branchId ?? null,
      createdCount: created.length,
      records: created,
    };
  }

  async summaryReport(
    principal: Principal,
    query: AttendanceReportQueryDto,
  ) {
    await this.assertEnabled(principal);
    this.assertDateOrder(query.from, query.to);
    if (this.inclusiveDays(query.from, query.to) > 366) {
      throw new BadRequestException(
        'Attendance report range cannot exceed 366 days.',
      );
    }

    const conditions = [
      eq(attendanceRecords.organizationId, principal.organizationId),
      gte(attendanceRecords.attendanceDate, query.from),
      lte(attendanceRecords.attendanceDate, query.to),
    ];
    if (query.employeeId) {
      conditions.push(eq(attendanceEmployees.id, query.employeeId));
    }
    if (query.branchId) {
      conditions.push(eq(attendanceEmployees.branchId, query.branchId));
    }
    if (query.departmentId) {
      conditions.push(
        eq(attendanceEmployees.departmentId, query.departmentId),
      );
    }

    const rows = await this.database.db
      .select({
        employeeId: attendanceEmployees.id,
        employeeCode: attendanceEmployees.employeeCode,
        displayName: attendanceEmployees.displayName,
        totalDays: sql<number>`count(*)::int`,
        presentDays: sql<number>`sum(case when ${attendanceRecords.status} in ('PRESENT','PARTIAL') then 1 else 0 end)::int`,
        absentDays: sql<number>`sum(case when ${attendanceRecords.status} = 'ABSENT' then 1 else 0 end)::int`,
        leaveDays: sql<number>`sum(case when ${attendanceRecords.status} = 'LEAVE' then 1 else 0 end)::int`,
        holidayDays: sql<number>`sum(case when ${attendanceRecords.status} = 'HOLIDAY' then 1 else 0 end)::int`,
        weekOffDays: sql<number>`sum(case when ${attendanceRecords.status} = 'WEEK_OFF' then 1 else 0 end)::int`,
        lateDays: sql<number>`sum(case when ${attendanceRecords.lateMinutes} > 0 then 1 else 0 end)::int`,
        workMinutes: sql<number>`coalesce(sum(${attendanceRecords.workMinutes}),0)::int`,
        overtimeMinutes: sql<number>`coalesce(sum(${attendanceRecords.overtimeMinutes}),0)::int`,
      })
      .from(attendanceRecords)
      .innerJoin(
        attendanceEmployees,
        eq(attendanceEmployees.id, attendanceRecords.employeeId),
      )
      .where(and(...conditions))
      .groupBy(
        attendanceEmployees.id,
        attendanceEmployees.employeeCode,
        attendanceEmployees.displayName,
      )
      .orderBy(attendanceEmployees.displayName);

    return {
      from: query.from,
      to: query.to,
      rows,
    };
  }

  private async assertEnabled(principal: Principal) {
    if (principal.isPlatformAdmin) return;
    if (
      !(await this.entitlements.can(
        principal.organizationId,
        'extension.attendance',
      ))
    ) {
      throw new ForbiddenException('Attendance extension is not enabled.');
    }
  }

  private async resolveWorkspace(
    principal: Principal,
    workspaceId?: string,
  ) {
    const rows = await this.database.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(
        workspaceId
          ? and(
              eq(workspaces.organizationId, principal.organizationId),
              eq(workspaces.id, workspaceId),
            )
          : eq(workspaces.organizationId, principal.organizationId),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Workspace not found.');
    return rows[0].id;
  }

  private async resolveBranch(principal: Principal, branchId: string) {
    const rows = await this.database.db
      .select()
      .from(branches)
      .where(
        and(
          eq(branches.organizationId, principal.organizationId),
          eq(branches.id, branchId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Branch not found.');
    return rows[0];
  }

  private async resolveMember(principal: Principal, memberId: string) {
    const rows = await this.database.db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(
            organizationMembers.organizationId,
            principal.organizationId,
          ),
          eq(organizationMembers.id, memberId),
          eq(organizationMembers.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Organization member not found.');
    return rows[0];
  }

  private async getDepartment(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(attendanceDepartments)
      .where(
        and(
          eq(
            attendanceDepartments.organizationId,
            principal.organizationId,
          ),
          eq(attendanceDepartments.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Department not found.');
    return rows[0];
  }

  private async getEmployee(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(attendanceEmployees)
      .where(
        and(
          eq(attendanceEmployees.organizationId, principal.organizationId),
          eq(attendanceEmployees.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Employee not found.');
    return rows[0];
  }

  private async getEmployeeForMember(
    principal: Principal,
    memberId: string,
  ) {
    const rows = await this.database.db
      .select()
      .from(attendanceEmployees)
      .where(
        and(
          eq(attendanceEmployees.organizationId, principal.organizationId),
          eq(attendanceEmployees.organizationMemberId, memberId),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException(
        'No attendance employee profile is linked to this account.',
      );
    }
    return rows[0];
  }

  private async getShift(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(attendanceShifts)
      .where(
        and(
          eq(attendanceShifts.organizationId, principal.organizationId),
          eq(attendanceShifts.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Shift not found.');
    return rows[0];
  }

  private async getPolicy(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(attendancePolicies)
      .where(
        and(
          eq(attendancePolicies.organizationId, principal.organizationId),
          eq(attendancePolicies.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Attendance policy not found.');
    return rows[0];
  }

  private async getShiftForEmployeeDate(
    principal: Principal,
    employeeId: string,
    attendanceDate: string,
  ) {
    const rows = await this.database.db
      .select({ shift: attendanceShifts })
      .from(attendanceShiftAssignments)
      .innerJoin(
        attendanceShifts,
        eq(attendanceShifts.id, attendanceShiftAssignments.shiftId),
      )
      .where(
        and(
          eq(
            attendanceShiftAssignments.organizationId,
            principal.organizationId,
          ),
          eq(attendanceShiftAssignments.employeeId, employeeId),
          lte(attendanceShiftAssignments.effectiveFrom, attendanceDate),
          or(
            isNull(attendanceShiftAssignments.effectiveTo),
            gte(
              attendanceShiftAssignments.effectiveTo,
              attendanceDate,
            ),
          ),
        ),
      )
      .orderBy(desc(attendanceShiftAssignments.effectiveFrom))
      .limit(1);
    return rows[0]?.shift;
  }

  private async employeeTimezone(
    employee: typeof attendanceEmployees.$inferSelect,
  ) {
    if (!employee.branchId) return 'Asia/Kolkata';
    const rows = await this.database.db
      .select({ timezone: branches.timezone })
      .from(branches)
      .where(eq(branches.id, employee.branchId))
      .limit(1);
    return rows[0]?.timezone ?? 'Asia/Kolkata';
  }

  private async resolvePolicy(
    principal: Principal,
    employee: typeof attendanceEmployees.$inferSelect,
  ) {
    if (employee.branchId) {
      const branchRows = await this.database.db
        .select()
        .from(attendancePolicies)
        .where(
          and(
            eq(attendancePolicies.organizationId, principal.organizationId),
            eq(attendancePolicies.workspaceId, employee.workspaceId),
            eq(attendancePolicies.branchId, employee.branchId),
            eq(attendancePolicies.status, 'ACTIVE'),
          ),
        )
        .orderBy(desc(attendancePolicies.isDefault), desc(attendancePolicies.createdAt))
        .limit(1);
      if (branchRows[0]) return branchRows[0];
    }

    const workspaceRows = await this.database.db
      .select()
      .from(attendancePolicies)
      .where(
        and(
          eq(attendancePolicies.organizationId, principal.organizationId),
          eq(attendancePolicies.workspaceId, employee.workspaceId),
          isNull(attendancePolicies.branchId),
          eq(attendancePolicies.status, 'ACTIVE'),
        ),
      )
      .orderBy(desc(attendancePolicies.isDefault), desc(attendancePolicies.createdAt))
      .limit(1);
    return workspaceRows[0];
  }

  private validateLocationPolicy(
    dto: {
      locationValidationMode?: string;
      latitude?: string;
      longitude?: string;
      radiusMeters?: number;
      maxAccuracyMeters?: number;
    },
  ) {
    const mode = dto.locationValidationMode ?? 'NONE';
    if (mode === 'NONE') return;
    if (
      dto.latitude === undefined ||
      dto.longitude === undefined ||
      dto.radiusMeters === undefined
    ) {
      throw new BadRequestException(
        'Location-enabled attendance policy requires latitude, longitude and radius.',
      );
    }
    const latitude = Number(dto.latitude);
    const longitude = Number(dto.longitude);
    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException('Invalid attendance policy coordinates.');
    }
  }

  private validatePunchLocation(
    policy: typeof attendancePolicies.$inferSelect | undefined,
    dto: PunchDto,
  ) {
    if (!policy || policy.locationValidationMode === 'NONE') {
      return {
        status: 'NOT_REQUIRED',
        distanceMeters: undefined as number | undefined,
      };
    }

    if (dto.latitude === undefined || dto.longitude === undefined) {
      if (
        policy.locationValidationMode === 'REQUIRED' &&
        !policy.allowRemote
      ) {
        throw new BadRequestException(
          'Location is required for attendance at this branch.',
        );
      }
      return {
        status: 'UNAVAILABLE',
        distanceMeters: undefined as number | undefined,
      };
    }

    if (
      policy.latitude === null ||
      policy.longitude === null ||
      policy.radiusMeters === null
    ) {
      throw new ConflictException(
        'Attendance location policy is incomplete.',
      );
    }

    const latitude = Number(dto.latitude);
    const longitude = Number(dto.longitude);
    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException('Invalid attendance coordinates.');
    }

    if (
      policy.locationValidationMode === 'REQUIRED' &&
      !policy.allowRemote &&
      dto.accuracyMeters === undefined
    ) {
      throw new BadRequestException(
        'Location accuracy is required for attendance at this branch.',
      );
    }

    const distanceMeters = Math.round(
      this.haversineMeters(
        latitude,
        longitude,
        Number(policy.latitude),
        Number(policy.longitude),
      ),
    );
    const inside = distanceMeters <= policy.radiusMeters;
    const lowAccuracy =
      dto.accuracyMeters !== undefined &&
      dto.accuracyMeters > policy.maxAccuracyMeters;

    if (
      lowAccuracy &&
      policy.locationValidationMode === 'REQUIRED' &&
      !policy.allowRemote
    ) {
      throw new BadRequestException(
        `Location accuracy is too low. Required accuracy: ${policy.maxAccuracyMeters}m or better.`,
      );
    }

    if (
      !inside &&
      policy.locationValidationMode === 'REQUIRED' &&
      !policy.allowRemote
    ) {
      throw new ForbiddenException(
        'Attendance punch is outside the allowed branch radius.',
      );
    }

    return {
      status: lowAccuracy
        ? 'LOW_ACCURACY'
        : inside
          ? 'VALID'
          : 'OUTSIDE',
      distanceMeters,
    };
  }

  private haversineMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const radius = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private normalizeTime(value: string) {
    return value.length === 5 ? `${value}:00` : value;
  }

  private calculateExpectedShiftMinutes(
    startTime: string,
    endTime: string,
    breakMinutes: number,
  ) {
    const start = this.timeMinutes(startTime);
    let end = this.timeMinutes(endTime);
    if (end <= start) end += 1440;
    const expected = end - start - breakMinutes;
    if (expected <= 0) {
      throw new BadRequestException(
        'Shift duration must exceed configured break time.',
      );
    }
    return expected;
  }

  private timeMinutes(value: string) {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private clockMinutes(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
    const minute = Number(
      parts.find((part) => part.type === 'minute')?.value ?? 0,
    );
    return hour * 60 + minute;
  }

  private localDate(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (!year || !month || !day) {
      throw new BadRequestException('Unable to resolve attendance date.');
    }
    return `${year}-${month}-${day}`;
  }

  private isOvernightShift(
    shift: typeof attendanceShifts.$inferSelect,
  ) {
    return this.timeMinutes(shift.endTime) <= this.timeMinutes(shift.startTime);
  }

  private addDays(date: string, days: number) {
    const value = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException('Invalid attendance date.');
    }
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }

  private localWeekday(date: string, _timezone: string) {
    return new Date(`${date}T00:00:00.000Z`).getUTCDay();
  }

  private inclusiveDays(from: string, to: string) {
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      throw new BadRequestException('Invalid date range.');
    }
    return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  }

  private assertDateOrder(from: string, to?: string) {
    if (!to) return;
    if (this.inclusiveDays(from, to) < 1) {
      throw new BadRequestException(
        'Start date cannot be after end date.',
      );
    }
  }

  private assertIdempotentPunchMatches(
    event: typeof attendanceEvents.$inferSelect,
    employeeId: string,
    kind: PunchKind,
    isAdmin: boolean,
  ) {
    const expectedType =
      kind === 'CHECK_IN'
        ? isAdmin
          ? 'MANUAL_IN'
          : 'CHECK_IN'
        : isAdmin
          ? 'MANUAL_OUT'
          : 'CHECK_OUT';
    if (
      event.employeeId !== employeeId ||
      event.eventType !== expectedType
    ) {
      throw new ConflictException(
        'Idempotency key was already used for a different attendance action.',
      );
    }
  }

  private isUniqueViolation(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    return 'code' in error && (error as { code?: string }).code === '23505';
  }

  private async audit(
    tx: Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0],
    principal: Principal,
    workspaceId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    after: Record<string, unknown>,
    before?: Record<string, unknown>,
  ) {
    await tx.insert(auditLogs).values({
      organizationId: principal.organizationId,
      workspaceId,
      actorType: principal.actorType ?? 'USER',
      actorId: principal.actorId ?? principal.userId,
      action,
      resourceType,
      resourceId,
      before,
      after,
    });
  }
}
