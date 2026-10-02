import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  branches,
  organizationMembers,
  organizations,
  workspaces,
} from '../../platform/database/schema.js';

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

export const attendanceDepartments = pgTable(
  'attendance_departments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, {
      onDelete: 'set null',
    }),
    managerMemberId: uuid('manager_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    name: varchar('name', { length: 180 }).notNull(),
    code: varchar('code', { length: 64 }),
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('attendance_departments_org_code_uq').on(
      table.organizationId,
      table.code,
    ),
    index('attendance_departments_org_workspace_idx').on(
      table.organizationId,
      table.workspaceId,
    ),
    index('attendance_departments_org_branch_idx').on(
      table.organizationId,
      table.branchId,
    ),
  ],
);

export const attendanceEmployees = pgTable(
  'attendance_employees',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, {
      onDelete: 'set null',
    }),
    departmentId: uuid('department_id').references(
      () => attendanceDepartments.id,
      { onDelete: 'set null' },
    ),
    organizationMemberId: uuid('organization_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    managerMemberId: uuid('manager_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    employeeCode: varchar('employee_code', { length: 64 }).notNull(),
    displayName: varchar('display_name', { length: 180 }).notNull(),
    email: varchar('email', { length: 320 }),
    phone: varchar('phone', { length: 40 }),
    designation: varchar('designation', { length: 160 }),
    employmentType: varchar('employment_type', { length: 32 })
      .default('FULL_TIME')
      .notNull(),
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    joiningDate: date('joining_date'),
    exitDate: date('exit_date'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('attendance_employees_org_code_uq').on(
      table.organizationId,
      table.employeeCode,
    ),
    uniqueIndex('attendance_employees_org_member_uq').on(
      table.organizationId,
      table.organizationMemberId,
    ),
    index('attendance_employees_org_branch_status_idx').on(
      table.organizationId,
      table.branchId,
      table.status,
    ),
    index('attendance_employees_org_department_idx').on(
      table.organizationId,
      table.departmentId,
    ),
  ],
);

export const attendanceShifts = pgTable(
  'attendance_shifts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 160 }).notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    timezone: varchar('timezone', { length: 80 })
      .default('Asia/Kolkata')
      .notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    breakMinutes: integer('break_minutes').default(0).notNull(),
    graceMinutes: integer('grace_minutes').default(0).notNull(),
    expectedMinutes: integer('expected_minutes').notNull(),
    weeklyOffDays: jsonb('weekly_off_days')
      .$type<number[]>()
      .default([])
      .notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('attendance_shifts_org_code_uq').on(
      table.organizationId,
      table.code,
    ),
    index('attendance_shifts_org_branch_idx').on(
      table.organizationId,
      table.branchId,
    ),
  ],
);

export const attendanceShiftAssignments = pgTable(
  'attendance_shift_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => attendanceEmployees.id, { onDelete: 'cascade' }),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => attendanceShifts.id, { onDelete: 'cascade' }),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('attendance_shift_assignments_emp_from_uq').on(
      table.organizationId,
      table.employeeId,
      table.effectiveFrom,
    ),
    index('attendance_shift_assignments_emp_range_idx').on(
      table.organizationId,
      table.employeeId,
      table.effectiveFrom,
      table.effectiveTo,
    ),
  ],
);

export const attendancePolicies = pgTable(
  'attendance_policies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, {
      onDelete: 'cascade',
    }),
    name: varchar('name', { length: 180 }).notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    locationValidationMode: varchar('location_validation_mode', { length: 24 })
      .default('NONE')
      .notNull(),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    radiusMeters: integer('radius_meters'),
    maxAccuracyMeters: integer('max_accuracy_meters').default(100).notNull(),
    allowRemote: boolean('allow_remote').default(false).notNull(),
    lateGraceMinutes: integer('late_grace_minutes').default(0).notNull(),
    earlyExitGraceMinutes: integer('early_exit_grace_minutes')
      .default(0)
      .notNull(),
    maxShiftHours: integer('max_shift_hours').default(16).notNull(),
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('attendance_policies_org_branch_idx').on(
      table.organizationId,
      table.branchId,
      table.status,
    ),
    uniqueIndex('attendance_policies_workspace_default_uq')
      .on(table.organizationId, table.workspaceId)
      .where(
        sql`${table.isDefault} = true and ${table.branchId} is null and ${table.status} = 'ACTIVE'`,
      ),
    uniqueIndex('attendance_policies_branch_default_uq')
      .on(table.organizationId, table.workspaceId, table.branchId)
      .where(
        sql`${table.isDefault} = true and ${table.branchId} is not null and ${table.status} = 'ACTIVE'`,
      ),
  ],
);

export const attendanceHolidays = pgTable(
  'attendance_holidays',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, {
      onDelete: 'cascade',
    }),
    holidayDate: date('holiday_date').notNull(),
    name: varchar('name', { length: 180 }).notNull(),
    holidayType: varchar('holiday_type', { length: 32 })
      .default('COMPANY')
      .notNull(),
    isPaid: boolean('is_paid').default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('attendance_holidays_scope_date_name_uq').on(
      table.organizationId,
      table.workspaceId,
      table.branchId,
      table.holidayDate,
      table.name,
    ),
    index('attendance_holidays_org_date_idx').on(
      table.organizationId,
      table.holidayDate,
    ),
  ],
);

export const attendanceLeaveRequests = pgTable(
  'attendance_leave_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => attendanceEmployees.id, { onDelete: 'cascade' }),
    leaveType: varchar('leave_type', { length: 64 }).notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    requestedDays: numeric('requested_days', { precision: 6, scale: 2 })
      .notNull(),
    reason: text('reason'),
    status: varchar('status', { length: 32 }).default('PENDING').notNull(),
    approverMemberId: uuid('approver_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNotes: text('decision_notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('attendance_leave_org_employee_dates_idx').on(
      table.organizationId,
      table.employeeId,
      table.startDate,
      table.endDate,
    ),
    index('attendance_leave_org_status_idx').on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
  ],
);

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => attendanceEmployees.id, { onDelete: 'cascade' }),
    shiftId: uuid('shift_id').references(() => attendanceShifts.id, {
      onDelete: 'set null',
    }),
    attendanceDate: date('attendance_date').notNull(),
    status: varchar('status', { length: 32 }).default('PRESENT').notNull(),
    firstCheckInAt: timestamp('first_check_in_at', { withTimezone: true }),
    lastCheckOutAt: timestamp('last_check_out_at', { withTimezone: true }),
    workMinutes: integer('work_minutes').default(0).notNull(),
    lateMinutes: integer('late_minutes').default(0).notNull(),
    earlyExitMinutes: integer('early_exit_minutes').default(0).notNull(),
    overtimeMinutes: integer('overtime_minutes').default(0).notNull(),
    notes: text('notes'),
    source: varchar('source', { length: 32 }).default('EVENTS').notNull(),
    updatedAt: updatedAt(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('attendance_records_org_employee_date_uq').on(
      table.organizationId,
      table.employeeId,
      table.attendanceDate,
    ),
    index('attendance_records_org_date_status_idx').on(
      table.organizationId,
      table.attendanceDate,
      table.status,
    ),
    index('attendance_records_org_employee_date_idx').on(
      table.organizationId,
      table.employeeId,
      table.attendanceDate,
    ),
  ],
);

export const attendanceEvents = pgTable(
  'attendance_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => attendanceEmployees.id, { onDelete: 'cascade' }),
    recordId: uuid('record_id').references(() => attendanceRecords.id, {
      onDelete: 'set null',
    }),
    shiftId: uuid('shift_id').references(() => attendanceShifts.id, {
      onDelete: 'set null',
    }),
    branchId: uuid('branch_id').references(() => branches.id, {
      onDelete: 'set null',
    }),
    policyId: uuid('policy_id').references(() => attendancePolicies.id, {
      onDelete: 'set null',
    }),
    eventType: varchar('event_type', { length: 32 }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    source: varchar('source', { length: 32 }).default('WEB').notNull(),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    accuracyMeters: integer('accuracy_meters'),
    locationValidation: varchar('location_validation', { length: 32 })
      .default('NOT_REQUIRED')
      .notNull(),
    distanceMeters: integer('distance_meters'),
    idempotencyKey: varchar('idempotency_key', { length: 160 }),
    actorType: varchar('actor_type', { length: 32 }).default('USER').notNull(),
    actorId: uuid('actor_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('attendance_events_org_idempotency_uq').on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index('attendance_events_org_employee_time_idx').on(
      table.organizationId,
      table.employeeId,
      table.occurredAt,
    ),
    index('attendance_events_org_record_idx').on(
      table.organizationId,
      table.recordId,
    ),
  ],
);
