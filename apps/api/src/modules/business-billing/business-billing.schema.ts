import {
  boolean,
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
  organizations,
  organizationMembers,
  workspaces,
} from '../../platform/database/schema.js';
import { companies, contacts, deals } from '../crm/crm.schema.js';

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

export const businessBillingSettings = pgTable(
  'business_billing_settings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    legalName: varchar('legal_name', { length: 240 }).notNull(),
    taxId: varchar('tax_id', { length: 120 }),
    billingEmail: varchar('billing_email', { length: 320 }),
    billingPhone: varchar('billing_phone', { length: 40 }),
    addressLine1: varchar('address_line_1', { length: 240 }),
    addressLine2: varchar('address_line_2', { length: 240 }),
    city: varchar('city', { length: 120 }),
    state: varchar('state', { length: 120 }),
    postalCode: varchar('postal_code', { length: 32 }),
    country: varchar('country', { length: 2 }).default('IN').notNull(),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    quotePrefix: varchar('quote_prefix', { length: 24 }).default('Q').notNull(),
    invoicePrefix: varchar('invoice_prefix', { length: 24 }).default('INV').notNull(),
    creditNotePrefix: varchar('credit_note_prefix', { length: 24 }).default('CN').notNull(),
    receiptPrefix: varchar('receipt_prefix', { length: 24 }).default('RCT').notNull(),
    defaultPaymentTermsDays: integer('default_payment_terms_days').default(15).notNull(),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('business_billing_settings_org_workspace_uq').on(
      table.organizationId,
      table.workspaceId,
    ),
  ],
);

export const businessDocumentSequences = pgTable(
  'business_document_sequences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    documentType: varchar('document_type', { length: 32 }).notNull(),
    nextValue: integer('next_value').default(1).notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('business_document_sequences_scope_type_uq').on(
      table.organizationId,
      table.workspaceId,
      table.documentType,
    ),
  ],
);

export const businessTaxRates = pgTable(
  'business_tax_rates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    ratePercent: numeric('rate_percent', { precision: 8, scale: 4 }).notNull(),
    taxCode: varchar('tax_code', { length: 80 }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('business_tax_rates_org_workspace_name_uq').on(
      table.organizationId,
      table.workspaceId,
      table.name,
    ),
  ],
);

export const businessQuotes = pgTable(
  'business_quotes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
    ownerMemberId: uuid('owner_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    quoteNumber: varchar('quote_number', { length: 80 }),
    status: varchar('status', { length: 32 }).default('DRAFT').notNull(),
    customerSnapshot: jsonb('customer_snapshot').$type<Record<string, unknown>>(),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    subtotal: numeric('subtotal', { precision: 18, scale: 2 }).default('0').notNull(),
    discountAmount: numeric('discount_amount', { precision: 18, scale: 2 }).default('0').notNull(),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 2 }).default('0').notNull(),
    total: numeric('total', { precision: 18, scale: 2 }).default('0').notNull(),
    validUntil: date('valid_until'),
    notes: text('notes'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('business_quotes_org_number_uq').on(table.organizationId, table.quoteNumber),
    index('business_quotes_org_status_idx').on(table.organizationId, table.status),
    index('business_quotes_org_contact_idx').on(table.organizationId, table.contactId),
  ],
);

export const businessQuoteItems = pgTable(
  'business_quote_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => businessQuotes.id, { onDelete: 'cascade' }),
    position: integer('position').default(0).notNull(),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 18, scale: 2 }).notNull(),
    discountAmount: numeric('discount_amount', { precision: 18, scale: 2 }).default('0').notNull(),
    taxRatePercent: numeric('tax_rate_percent', { precision: 8, scale: 4 }).default('0').notNull(),
    taxableAmount: numeric('taxable_amount', { precision: 18, scale: 2 }).notNull(),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 2 }).notNull(),
    lineTotal: numeric('line_total', { precision: 18, scale: 2 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [index('business_quote_items_quote_idx').on(table.quoteId, table.position)],
);

export const businessInvoices = pgTable(
  'business_invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    quoteId: uuid('quote_id').references(() => businessQuotes.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
    ownerMemberId: uuid('owner_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    invoiceNumber: varchar('invoice_number', { length: 80 }),
    status: varchar('status', { length: 32 }).default('DRAFT').notNull(),
    customerSnapshot: jsonb('customer_snapshot').$type<Record<string, unknown>>(),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    subtotal: numeric('subtotal', { precision: 18, scale: 2 }).default('0').notNull(),
    discountAmount: numeric('discount_amount', { precision: 18, scale: 2 }).default('0').notNull(),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 2 }).default('0').notNull(),
    total: numeric('total', { precision: 18, scale: 2 }).default('0').notNull(),
    paidAmount: numeric('paid_amount', { precision: 18, scale: 2 }).default('0').notNull(),
    creditedAmount: numeric('credited_amount', { precision: 18, scale: 2 }).default('0').notNull(),
    balanceDue: numeric('balance_due', { precision: 18, scale: 2 }).default('0').notNull(),
    issueDate: date('issue_date'),
    dueDate: date('due_date'),
    notes: text('notes'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('business_invoices_org_number_uq').on(
      table.organizationId,
      table.invoiceNumber,
    ),
    index('business_invoices_org_status_due_idx').on(
      table.organizationId,
      table.status,
      table.dueDate,
    ),
    index('business_invoices_org_contact_idx').on(table.organizationId, table.contactId),
  ],
);

export const businessInvoiceItems = pgTable(
  'business_invoice_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => businessInvoices.id, { onDelete: 'cascade' }),
    position: integer('position').default(0).notNull(),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 18, scale: 2 }).notNull(),
    discountAmount: numeric('discount_amount', { precision: 18, scale: 2 }).default('0').notNull(),
    taxRatePercent: numeric('tax_rate_percent', { precision: 8, scale: 4 }).default('0').notNull(),
    taxableAmount: numeric('taxable_amount', { precision: 18, scale: 2 }).notNull(),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 2 }).notNull(),
    lineTotal: numeric('line_total', { precision: 18, scale: 2 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [index('business_invoice_items_invoice_idx').on(table.invoiceId, table.position)],
);

export const businessPayments = pgTable(
  'business_payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => businessInvoices.id, { onDelete: 'restrict' }),
    receiptNumber: varchar('receipt_number', { length: 80 }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    method: varchar('method', { length: 40 }).notNull(),
    reference: varchar('reference', { length: 180 }),
    status: varchar('status', { length: 32 }).default('POSTED').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }).defaultNow().notNull(),
    notes: text('notes'),
    createdByMemberId: uuid('created_by_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('business_payments_org_receipt_uq').on(
      table.organizationId,
      table.receiptNumber,
    ),
    index('business_payments_org_invoice_idx').on(
      table.organizationId,
      table.invoiceId,
      table.paidAt,
    ),
  ],
);

export const businessCreditNotes = pgTable(
  'business_credit_notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => businessInvoices.id, { onDelete: 'restrict' }),
    creditNoteNumber: varchar('credit_note_number', { length: 80 }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    reason: text('reason').notNull(),
    status: varchar('status', { length: 32 }).default('ISSUED').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
    createdByMemberId: uuid('created_by_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('business_credit_notes_org_number_uq').on(
      table.organizationId,
      table.creditNoteNumber,
    ),
    index('business_credit_notes_org_invoice_idx').on(
      table.organizationId,
      table.invoiceId,
    ),
  ],
);
