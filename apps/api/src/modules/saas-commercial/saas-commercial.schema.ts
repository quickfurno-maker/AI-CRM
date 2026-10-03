import {
  boolean,
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
  plans,
  subscriptions,
} from '../../platform/database/schema.js';

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

export const saasCustomerBillingProfiles = pgTable(
  'saas_customer_billing_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .unique('saas_customer_billing_profiles_org_uq')
      .references(() => organizations.id, { onDelete: 'cascade' }),
    legalName: varchar('legal_name', { length: 240 }).notNull(),
    billingEmail: varchar('billing_email', { length: 320 }).notNull(),
    billingPhone: varchar('billing_phone', { length: 40 }),
    taxId: varchar('tax_id', { length: 120 }),
    addressLine1: varchar('address_line_1', { length: 240 }),
    addressLine2: varchar('address_line_2', { length: 240 }),
    city: varchar('city', { length: 120 }),
    state: varchar('state', { length: 120 }),
    postalCode: varchar('postal_code', { length: 32 }),
    country: varchar('country', { length: 2 }).default('IN').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

export const saasPlanPrices = pgTable(
  'saas_plan_prices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    billingCycle: varchar('billing_cycle', { length: 24 }).notNull(),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    taxRatePercent: numeric('tax_rate_percent', { precision: 8, scale: 4 }).default('0').notNull(),
    status: varchar('status', { length: 24 }).default('DRAFT').notNull(),
    trialDays: integer('trial_days').default(0).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('saas_plan_prices_plan_cycle_currency_uq').on(
      table.planId,
      table.billingCycle,
      table.currency,
    ),
    index('saas_plan_prices_status_idx').on(table.status),
  ],
);

export const saasMeterPrices = pgTable(
  'saas_meter_prices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    meterKey: varchar('meter_key', { length: 160 }).notNull(),
    unit: varchar('unit', { length: 40 }).default('unit').notNull(),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    includedQuantity: numeric('included_quantity', {
      precision: 20,
      scale: 6,
    })
      .default('0')
      .notNull(),
    unitAmount: numeric('unit_amount', { precision: 18, scale: 6 })
      .default('0')
      .notNull(),
    warningThresholdPercent: integer('warning_threshold_percent')
      .default(80)
      .notNull(),
    enforcementMode: varchar('enforcement_mode', { length: 24 })
      .default('OVERAGE')
      .notNull(),
    isActive: boolean('is_active').default(false).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('saas_meter_prices_plan_meter_currency_uq').on(
      table.planId,
      table.meterKey,
      table.currency,
    ),
  ],
);

export const saasAddons = pgTable(
  'saas_addons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: varchar('key', { length: 120 }).notNull(),
    name: varchar('name', { length: 180 }).notNull(),
    description: text('description'),
    entitlementKey: varchar('entitlement_key', { length: 180 }).notNull(),
    entitlementMode: varchar('entitlement_mode', { length: 24 })
      .default('LIMIT_INCREMENT')
      .notNull(),
    unitsPerQuantity: integer('units_per_quantity').default(1).notNull(),
    isActive: boolean('is_active').default(false).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('saas_addons_key_uq').on(table.key)],
);

export const saasAddonPrices = pgTable(
  'saas_addon_prices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    addonId: uuid('addon_id')
      .notNull()
      .references(() => saasAddons.id, { onDelete: 'cascade' }),
    billingCycle: varchar('billing_cycle', { length: 24 }).notNull(),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    taxRatePercent: numeric('tax_rate_percent', { precision: 8, scale: 4 }).default('0').notNull(),
    status: varchar('status', { length: 24 }).default('DRAFT').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('saas_addon_prices_addon_cycle_currency_uq').on(
      table.addonId,
      table.billingCycle,
      table.currency,
    ),
  ],
);

export const saasSubscriptionAddons = pgTable(
  'saas_subscription_addons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    addonId: uuid('addon_id')
      .notNull()
      .references(() => saasAddons.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').default(1).notNull(),
    pendingQuantity: integer('pending_quantity'),
    pendingChangeAt: timestamp('pending_change_at', { withTimezone: true }),
    status: varchar('status', { length: 24 }).default('ACTIVE').notNull(),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('saas_subscription_addons_subscription_addon_uq').on(
      table.subscriptionId,
      table.addonId,
    ),
    index('saas_subscription_addons_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const saasCoupons = pgTable(
  'saas_coupons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 80 }).notNull(),
    name: varchar('name', { length: 180 }).notNull(),
    discountType: varchar('discount_type', { length: 24 }).notNull(),
    discountValue: numeric('discount_value', { precision: 18, scale: 2 })
      .notNull(),
    currency: varchar('currency', { length: 3 }),
    duration: varchar('duration', { length: 24 }).default('ONCE').notNull(),
    maxRedemptions: integer('max_redemptions'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    isActive: boolean('is_active').default(false).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('saas_coupons_code_uq').on(table.code)],
);

export const saasCouponRedemptions = pgTable(
  'saas_coupon_redemptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    couponId: uuid('coupon_id')
      .notNull()
      .references(() => saasCoupons.id, { onDelete: 'restrict' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    checkoutSessionId: uuid('checkout_session_id'),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('saas_coupon_redemptions_coupon_org_checkout_uq').on(
      table.couponId,
      table.organizationId,
      table.checkoutSessionId,
    ),
    index('saas_coupon_redemptions_coupon_idx').on(table.couponId),
  ],
);

export const saasCheckoutSessions = pgTable(
  'saas_checkout_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    requestedByMemberId: uuid('requested_by_member_id')
      .notNull()
      .references(() => organizationMembers.id, { onDelete: 'restrict' }),
    checkoutType: varchar('checkout_type', { length: 32 }).notNull(),
    planPriceId: uuid('plan_price_id').references(() => saasPlanPrices.id, {
      onDelete: 'restrict',
    }),
    addonPriceId: uuid('addon_price_id').references(() => saasAddonPrices.id, {
      onDelete: 'restrict',
    }),
    quantity: integer('quantity').default(1).notNull(),
    couponId: uuid('coupon_id').references(() => saasCoupons.id, {
      onDelete: 'set null',
    }),
    currency: varchar('currency', { length: 3 }).notNull(),
    subtotal: numeric('subtotal', { precision: 18, scale: 2 }).notNull(),
    discountAmount: numeric('discount_amount', { precision: 18, scale: 2 })
      .default('0')
      .notNull(),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 2 })
      .default('0')
      .notNull(),
    total: numeric('total', { precision: 18, scale: 2 }).notNull(),
    status: varchar('status', { length: 32 }).default('OPEN').notNull(),
    provider: varchar('provider', { length: 40 }),
    providerSessionId: varchar('provider_session_id', { length: 240 }),
    providerPaymentId: varchar('provider_payment_id', { length: 240 }),
    idempotencyKey: varchar('idempotency_key', { length: 180 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('saas_checkout_sessions_org_idempotency_uq').on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index('saas_checkout_sessions_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const saasSubscriptionEvents = pgTable(
  'saas_subscription_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    createdByMemberId: uuid('created_by_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    createdAt: createdAt(),
  },
  (table) => [
    index('saas_subscription_events_subscription_created_idx').on(
      table.subscriptionId,
      table.createdAt,
    ),
  ],
);

export const saasUsageLedger = pgTable(
  'saas_usage_ledger',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    meterKey: varchar('meter_key', { length: 160 }).notNull(),
    quantity: numeric('quantity', { precision: 20, scale: 6 }).notNull(),
    unit: varchar('unit', { length: 40 }).default('unit').notNull(),
    sourceType: varchar('source_type', { length: 64 }).notNull(),
    sourceId: varchar('source_id', { length: 180 }),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 240 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('saas_usage_ledger_org_idempotency_uq').on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index('saas_usage_ledger_org_meter_occurred_idx').on(
      table.organizationId,
      table.meterKey,
      table.occurredAt,
    ),
  ],
);

export const saasInvoices = pgTable(
  'saas_invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'restrict' }),
    invoiceNumber: varchar('invoice_number', { length: 80 }).notNull(),
    status: varchar('status', { length: 32 }).default('OPEN').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    subtotal: numeric('subtotal', { precision: 18, scale: 2 }).notNull(),
    discountAmount: numeric('discount_amount', { precision: 18, scale: 2 })
      .default('0')
      .notNull(),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 2 })
      .default('0')
      .notNull(),
    total: numeric('total', { precision: 18, scale: 2 }).notNull(),
    paidAmount: numeric('paid_amount', { precision: 18, scale: 2 })
      .default('0')
      .notNull(),
    balanceDue: numeric('balance_due', { precision: 18, scale: 2 }).notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    checkoutSessionId: uuid('checkout_session_id').references(
      () => saasCheckoutSessions.id,
      { onDelete: 'set null' },
    ),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('saas_invoices_number_uq').on(table.invoiceNumber),
    index('saas_invoices_org_status_due_idx').on(
      table.organizationId,
      table.status,
      table.dueAt,
    ),
  ],
);

export const saasInvoiceLines = pgTable(
  'saas_invoice_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => saasInvoices.id, { onDelete: 'cascade' }),
    lineType: varchar('line_type', { length: 32 }).notNull(),
    referenceId: uuid('reference_id'),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 14, scale: 3 })
      .default('1')
      .notNull(),
    unitAmount: numeric('unit_amount', { precision: 18, scale: 2 })
      .notNull(),
    lineTotal: numeric('line_total', { precision: 18, scale: 2 })
      .notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [index('saas_invoice_lines_invoice_idx').on(table.invoiceId)],
);

export const saasReceipts = pgTable(
  'saas_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => saasInvoices.id, { onDelete: 'restrict' }),
    receiptNumber: varchar('receipt_number', { length: 80 }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    provider: varchar('provider', { length: 40 }),
    providerPaymentId: varchar('provider_payment_id', { length: 240 }),
    paidAt: timestamp('paid_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('saas_receipts_number_uq').on(table.receiptNumber),
    uniqueIndex('saas_receipts_provider_payment_uq').on(
      table.provider,
      table.providerPaymentId,
    ),
  ],
);

export const saasDunningCases = pgTable(
  'saas_dunning_cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => saasInvoices.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 32 }).default('OPEN').notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    graceEndsAt: timestamp('grace_ends_at', { withTimezone: true }),
    recoveredAt: timestamp('recovered_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('saas_dunning_cases_invoice_uq').on(table.invoiceId),
    index('saas_dunning_cases_status_next_idx').on(
      table.status,
      table.nextAttemptAt,
    ),
  ],
);

export const saasDunningAttempts = pgTable(
  'saas_dunning_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dunningCaseId: uuid('dunning_case_id')
      .notNull()
      .references(() => saasDunningCases.id, { onDelete: 'cascade' }),
    attemptNumber: integer('attempt_number').notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    providerAttemptId: varchar('provider_attempt_id', { length: 240 }),
    error: text('error'),
    attemptedAt: timestamp('attempted_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('saas_dunning_attempts_case_number_uq').on(
      table.dunningCaseId,
      table.attemptNumber,
    ),
  ],
);


export const saasPaymentIntents = pgTable(
  'saas_payment_intents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    checkoutSessionId: uuid('checkout_session_id').references(
      () => saasCheckoutSessions.id,
      { onDelete: 'set null' },
    ),
    invoiceId: uuid('invoice_id').references(() => saasInvoices.id, {
      onDelete: 'set null',
    }),
    dunningCaseId: uuid('dunning_case_id').references(
      () => saasDunningCases.id,
      { onDelete: 'set null' },
    ),
    provider: varchar('provider', { length: 40 }).notNull(),
    purpose: varchar('purpose', { length: 32 }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    status: varchar('status', { length: 32 }).default('CREATING').notNull(),
    providerOrderId: varchar('provider_order_id', { length: 240 }),
    providerPaymentId: varchar('provider_payment_id', { length: 240 }),
    failureCode: varchar('failure_code', { length: 120 }),
    failureReason: text('failure_reason'),
    idempotencyKey: varchar('idempotency_key', { length: 240 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('saas_payment_intents_provider_idempotency_uq').on(
      table.provider,
      table.idempotencyKey,
    ),
    uniqueIndex('saas_payment_intents_provider_order_uq').on(
      table.provider,
      table.providerOrderId,
    ),
    index('saas_payment_intents_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
    index('saas_payment_intents_checkout_idx').on(table.checkoutSessionId),
    index('saas_payment_intents_invoice_idx').on(table.invoiceId),
  ],
);

export const saasPaymentGatewayEvents = pgTable(
  'saas_payment_gateway_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: varchar('provider', { length: 40 }).notNull(),
    providerEventId: varchar('provider_event_id', { length: 240 }).notNull(),
    eventType: varchar('event_type', { length: 120 }).notNull(),
    signatureValid: boolean('signature_valid').default(false).notNull(),
    status: varchar('status', { length: 32 }).default('RECEIVED').notNull(),
    providerOrderId: varchar('provider_order_id', { length: 240 }),
    providerPaymentId: varchar('provider_payment_id', { length: 240 }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    error: text('error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('saas_payment_gateway_events_provider_event_uq').on(
      table.provider,
      table.providerEventId,
    ),
    index('saas_payment_gateway_events_status_received_idx').on(
      table.status,
      table.receivedAt,
    ),
  ],
);

export const saasPaymentRefunds = pgTable(
  'saas_payment_refunds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => saasInvoices.id, { onDelete: 'restrict' }),
    receiptId: uuid('receipt_id')
      .notNull()
      .references(() => saasReceipts.id, { onDelete: 'restrict' }),
    paymentIntentId: uuid('payment_intent_id').references(
      () => saasPaymentIntents.id,
      { onDelete: 'set null' },
    ),
    provider: varchar('provider', { length: 40 }).notNull(),
    providerPaymentId: varchar('provider_payment_id', { length: 240 }).notNull(),
    providerRefundId: varchar('provider_refund_id', { length: 240 }),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    status: varchar('status', { length: 32 }).default('CREATING').notNull(),
    reason: text('reason'),
    idempotencyKey: varchar('idempotency_key', { length: 240 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('saas_payment_refunds_provider_idempotency_uq').on(
      table.provider,
      table.idempotencyKey,
    ),
    uniqueIndex('saas_payment_refunds_provider_refund_uq').on(
      table.provider,
      table.providerRefundId,
    ),
    index('saas_payment_refunds_receipt_idx').on(table.receiptId),
    index('saas_payment_refunds_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const saasPaymentMandates = pgTable(
  'saas_payment_mandates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 40 }).notNull(),
    providerCustomerId: varchar('provider_customer_id', { length: 240 }),
    providerMethodId: varchar('provider_method_id', { length: 240 }),
    providerMandateId: varchar('provider_mandate_id', { length: 240 }),
    methodType: varchar('method_type', { length: 40 }),
    status: varchar('status', { length: 32 }).default('PENDING').notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    displayLabel: varchar('display_label', { length: 120 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    authorizedAt: timestamp('authorized_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('saas_payment_mandates_provider_mandate_uq').on(
      table.provider,
      table.providerMandateId,
    ),
    index('saas_payment_mandates_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);
