import {
  date,
  index,
  jsonb,
  pgTable,
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

export const staffProfiles = pgTable(
  'staff_profiles',
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
    department: varchar('department', { length: 160 }),
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
    uniqueIndex('staff_profiles_org_code_uq').on(
      table.organizationId,
      table.employeeCode,
    ),
    uniqueIndex('staff_profiles_org_member_uq').on(
      table.organizationId,
      table.organizationMemberId,
    ),
    index('staff_profiles_org_workspace_idx').on(
      table.organizationId,
      table.workspaceId,
    ),
    index('staff_profiles_org_branch_status_idx').on(
      table.organizationId,
      table.branchId,
      table.status,
    ),
  ],
);

export const memberSeatAssignments = pgTable(
  'member_seat_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    organizationMemberId: uuid('organization_member_id')
      .notNull()
      .references(() => organizationMembers.id, { onDelete: 'cascade' }),
    accessClass: varchar('access_class', { length: 32 }).notNull(),
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    assignedByMemberId: uuid('assigned_by_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    assignedAt: timestamp('assigned_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedByMemberId: uuid('revoked_by_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('member_seat_assignments_member_uq').on(
      table.organizationMemberId,
    ),
    index('member_seat_assignments_org_class_status_idx').on(
      table.organizationId,
      table.accessClass,
      table.status,
    ),
  ],
);
