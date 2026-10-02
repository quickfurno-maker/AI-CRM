import {
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
import { staffProfiles } from '../staff/staff.schema.js';

export const organizationInvitations = pgTable(
  'organization_invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 320 }).notNull(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    status: varchar('status', { length: 32 }).default('PENDING').notNull(),
    seatClass: varchar('seat_class', { length: 32 }).notNull(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, {
      onDelete: 'set null',
    }),
    staffProfileId: uuid('staff_profile_id').references(() => staffProfiles.id, {
      onDelete: 'set null',
    }),
    roleIds: jsonb('role_ids').$type<string[]>().default([]).notNull(),
    teamIds: jsonb('team_ids').$type<string[]>().default([]).notNull(),
    invitedByMemberId: uuid('invited_by_member_id')
      .notNull()
      .references(() => organizationMembers.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('organization_invitations_token_uq').on(table.tokenHash),
    index('organization_invitations_org_email_idx').on(
      table.organizationId,
      table.email,
    ),
    index('organization_invitations_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);
