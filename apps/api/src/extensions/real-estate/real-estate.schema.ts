import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  organizationMembers,
  organizations,
  workspaces,
} from '../../platform/database/schema.js';
import {
  appointments,
  contacts,
  deals,
  leads,
} from '../../modules/crm/crm.schema.js';

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

export const realEstateDevelopers = pgTable(
  're_developers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 240 }).notNull(),
    code: varchar('code', { length: 100 }),
    reraRegistration: varchar('rera_registration', { length: 160 }),
    website: text('website'),
    phone: varchar('phone', { length: 40 }),
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('re_developers_org_workspace_idx').on(
      table.organizationId,
      table.workspaceId,
    ),
    index('re_developers_org_name_idx').on(table.organizationId, table.name),
  ],
);

export const realEstateProjects = pgTable(
  're_projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    developerId: uuid('developer_id').references(() => realEstateDevelopers.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 240 }).notNull(),
    code: varchar('code', { length: 100 }),
    city: varchar('city', { length: 120 }).notNull(),
    locality: varchar('locality', { length: 160 }).notNull(),
    address: text('address'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    reraNumber: varchar('rera_number', { length: 160 }),
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    possessionDate: date('possession_date'),
    propertyTypes: jsonb('property_types').$type<string[]>().default([]).notNull(),
    amenities: jsonb('amenities').$type<string[]>().default([]).notNull(),
    minPrice: numeric('min_price', { precision: 18, scale: 2 }),
    maxPrice: numeric('max_price', { precision: 18, scale: 2 }),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('re_projects_org_workspace_idx').on(
      table.organizationId,
      table.workspaceId,
    ),
    index('re_projects_org_city_locality_idx').on(
      table.organizationId,
      table.city,
      table.locality,
    ),
    index('re_projects_developer_idx').on(table.organizationId, table.developerId),
  ],
);

export const realEstateBuildings = pgTable(
  're_buildings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => realEstateProjects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 180 }).notNull(),
    code: varchar('code', { length: 100 }),
    floors: integer('floors'),
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    possessionDate: date('possession_date'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('re_buildings_org_project_idx').on(
      table.organizationId,
      table.projectId,
    ),
  ],
);

export const realEstatePropertyOwners = pgTable(
  're_property_owners',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    ownerType: varchar('owner_type', { length: 32 }).default('INDIVIDUAL').notNull(),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('re_property_owners_org_contact_uq').on(
      table.organizationId,
      table.contactId,
    ),
  ],
);

export const realEstateBrokers = pgTable(
  're_brokers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    firmName: varchar('firm_name', { length: 240 }),
    registrationNumber: varchar('registration_number', { length: 160 }),
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('re_brokers_org_contact_uq').on(
      table.organizationId,
      table.contactId,
    ),
  ],
);

export const realEstateUnits = pgTable(
  're_units',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => realEstateProjects.id, {
      onDelete: 'set null',
    }),
    buildingId: uuid('building_id').references(() => realEstateBuildings.id, {
      onDelete: 'set null',
    }),
    propertyOwnerId: uuid('property_owner_id').references(
      () => realEstatePropertyOwners.id,
      { onDelete: 'set null' },
    ),
    unitNumber: varchar('unit_number', { length: 100 }),
    title: varchar('title', { length: 240 }).notNull(),
    city: varchar('city', { length: 120 }),
    locality: varchar('locality', { length: 160 }),
    address: text('address'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    propertyType: varchar('property_type', { length: 48 }).notNull(),
    configuration: varchar('configuration', { length: 80 }),
    bedrooms: integer('bedrooms'),
    bathrooms: integer('bathrooms'),
    carpetArea: numeric('carpet_area', { precision: 12, scale: 2 }),
    builtUpArea: numeric('built_up_area', { precision: 12, scale: 2 }),
    areaUnit: varchar('area_unit', { length: 24 }).default('SQFT').notNull(),
    floor: integer('floor'),
    facing: varchar('facing', { length: 48 }),
    price: numeric('price', { precision: 18, scale: 2 }),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    inventoryStatus: varchar('inventory_status', { length: 32 })
      .default('AVAILABLE')
      .notNull(),
    possessionStatus: varchar('possession_status', { length: 48 }),
    availableFrom: date('available_from'),
    amenities: jsonb('amenities').$type<string[]>().default([]).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('re_units_org_workspace_idx').on(
      table.organizationId,
      table.workspaceId,
    ),
    index('re_units_org_project_status_idx').on(
      table.organizationId,
      table.projectId,
      table.inventoryStatus,
    ),
    index('re_units_org_type_config_idx').on(
      table.organizationId,
      table.propertyType,
      table.configuration,
    ),
    index('re_units_org_city_locality_idx').on(
      table.organizationId,
      table.city,
      table.locality,
    ),
    index('re_units_org_status_price_idx').on(
      table.organizationId,
      table.inventoryStatus,
      table.price,
    ),
    index('re_units_org_status_carpet_idx').on(
      table.organizationId,
      table.inventoryStatus,
      table.carpetArea,
    ),
  ],
);

export const realEstateRequirements = pgTable(
  're_requirements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    ownerMemberId: uuid('owner_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    purpose: varchar('purpose', { length: 32 }).default('SELF_USE').notNull(),
    cities: jsonb('cities').$type<string[]>().default([]).notNull(),
    localities: jsonb('localities').$type<string[]>().default([]).notNull(),
    propertyTypes: jsonb('property_types').$type<string[]>().default([]).notNull(),
    configurations: jsonb('configurations').$type<string[]>().default([]).notNull(),
    minBudget: numeric('min_budget', { precision: 18, scale: 2 }),
    maxBudget: numeric('max_budget', { precision: 18, scale: 2 }),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    minCarpetArea: numeric('min_carpet_area', { precision: 12, scale: 2 }),
    maxCarpetArea: numeric('max_carpet_area', { precision: 12, scale: 2 }),
    purchaseTimeline: varchar('purchase_timeline', { length: 80 }),
    possessionPreference: varchar('possession_preference', { length: 80 }),
    mustHaveAmenities: jsonb('must_have_amenities').$type<string[]>().default([]).notNull(),
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('re_requirements_org_contact_idx').on(
      table.organizationId,
      table.contactId,
    ),
    index('re_requirements_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const realEstateRequirementMatches = pgTable(
  're_requirement_matches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => realEstateRequirements.id, { onDelete: 'cascade' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => realEstateUnits.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    reasons: jsonb('reasons').$type<string[]>().default([]).notNull(),
    status: varchar('status', { length: 32 }).default('SUGGESTED').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('re_requirement_matches_pair_uq').on(
      table.requirementId,
      table.unitId,
    ),
    index('re_requirement_matches_org_requirement_idx').on(
      table.organizationId,
      table.requirementId,
    ),
  ],
);

export const realEstateSiteVisits = pgTable(
  're_site_visits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    requirementId: uuid('requirement_id').references(
      () => realEstateRequirements.id,
      { onDelete: 'set null' },
    ),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => realEstateProjects.id, {
      onDelete: 'set null',
    }),
    unitId: uuid('unit_id').references(() => realEstateUnits.id, {
      onDelete: 'set null',
    }),
    appointmentId: uuid('appointment_id').references(() => appointments.id, {
      onDelete: 'set null',
    }),
    ownerMemberId: uuid('owner_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 32 }).default('SCHEDULED').notNull(),
    outcome: varchar('outcome', { length: 48 }),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('re_site_visits_org_schedule_idx').on(
      table.organizationId,
      table.scheduledAt,
    ),
    index('re_site_visits_org_contact_idx').on(
      table.organizationId,
      table.contactId,
    ),
  ],
);

export const realEstateOffers = pgTable(
  're_offers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    requirementId: uuid('requirement_id').references(
      () => realEstateRequirements.id,
      { onDelete: 'set null' },
    ),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => realEstateUnits.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    status: varchar('status', { length: 32 }).default('DRAFT').notNull(),
    validUntil: date('valid_until'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('re_offers_org_unit_idx').on(table.organizationId, table.unitId),
    index('re_offers_org_deal_idx').on(table.organizationId, table.dealId),
  ],
);

export const realEstateBookings = pgTable(
  're_bookings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'restrict' }),
    requirementId: uuid('requirement_id').references(
      () => realEstateRequirements.id,
      { onDelete: 'set null' },
    ),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
    offerId: uuid('offer_id').references(() => realEstateOffers.id, {
      onDelete: 'set null',
    }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => realEstateUnits.id, { onDelete: 'restrict' }),
    brokerId: uuid('broker_id').references(() => realEstateBrokers.id, {
      onDelete: 'set null',
    }),
    status: varchar('status', { length: 32 }).default('RESERVED').notNull(),
    bookingAmount: numeric('booking_amount', { precision: 18, scale: 2 }),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    bookedAt: timestamp('booked_at', { withTimezone: true }).defaultNow().notNull(),
    externalReference: varchar('external_reference', { length: 160 }),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('re_bookings_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
    index('re_bookings_org_unit_idx').on(table.organizationId, table.unitId),
  ],
);

export const realEstateCommissions = pgTable(
  're_commissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => realEstateBookings.id, { onDelete: 'cascade' }),
    brokerId: uuid('broker_id').references(() => realEstateBrokers.id, {
      onDelete: 'set null',
    }),
    commissionType: varchar('commission_type', { length: 32 })
      .default('FIXED')
      .notNull(),
    rate: numeric('rate', { precision: 8, scale: 4 }),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    status: varchar('status', { length: 32 }).default('PENDING').notNull(),
    payableAt: date('payable_at'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('re_commissions_org_booking_idx').on(
      table.organizationId,
      table.bookingId,
    ),
    index('re_commissions_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);
