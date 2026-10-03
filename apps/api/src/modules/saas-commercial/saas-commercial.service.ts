import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  auditLogs,
  entitlements,
  outboxEvents,
  plans,
  subscriptions,
} from '../../platform/database/schema.js';
import type {
  CancelSubscriptionDto,
  ChangeAddonDto,
  CompleteCheckoutDto,
  CreateAddonCheckoutDto,
  CreatePlanCheckoutDto,
  FailCheckoutDto,
  ReconcileInvoicePaymentDto,
  SchedulePlanChangeDto,
  StartTrialDto,
  UpsertSaasBillingProfileDto,
} from './saas-commercial.dto.js';
import { SaasCommercialEntitlementsService } from './saas-commercial-entitlements.service.js';
import {
  saasAddonPrices,
  saasAddons,
  saasCheckoutSessions,
  saasCouponRedemptions,
  saasCoupons,
  saasCustomerBillingProfiles,
  saasDunningAttempts,
  saasDunningCases,
  saasInvoiceLines,
  saasInvoices,
  saasPlanPrices,
  saasReceipts,
  saasSubscriptionAddons,
  saasSubscriptionEvents,
} from './saas-commercial.schema.js';
import { SaasUsageMeterService } from './saas-usage-meter.service.js';

type PlanPrice = typeof saasPlanPrices.$inferSelect;
type Coupon = typeof saasCoupons.$inferSelect;
type Subscription = typeof subscriptions.$inferSelect;

@Injectable()
export class SaasCommercialService {
  constructor(
    private readonly database: DatabaseService,
    private readonly commercialEntitlements: SaasCommercialEntitlementsService,
    private readonly usage: SaasUsageMeterService,
  ) {}

  async customerCatalog() {
    const [planRows, planPrices, addons, addonPrices] = await Promise.all([
      this.database.db
        .select()
        .from(plans)
        .where(eq(plans.isActive, true))
        .orderBy(plans.name),
      this.database.db
        .select()
        .from(saasPlanPrices)
        .where(eq(saasPlanPrices.status, 'ACTIVE')),
      this.database.db
        .select()
        .from(saasAddons)
        .where(eq(saasAddons.isActive, true))
        .orderBy(saasAddons.name),
      this.database.db
        .select()
        .from(saasAddonPrices)
        .where(eq(saasAddonPrices.status, 'ACTIVE')),
    ]);

    return {
      plans: planRows
        .map((plan) => ({
          id: plan.id,
          key: plan.key,
          name: plan.name,
          prices: planPrices.filter(
            (price) => price.planId === plan.id,
          ),
        }))
        .filter((plan) => plan.prices.length > 0),
      addons: addons
        .map((addon) => ({
          ...addon,
          prices: addonPrices.filter(
            (price) => price.addonId === addon.id,
          ),
        }))
        .filter((addon) => addon.prices.length > 0),
    };
  }

  async portal(principal: Principal) {
    const subscription = await this.getSubscription(
      principal.organizationId,
    );
    const [
      plan,
      profile,
      addons,
      invoices,
      receipts,
      organizationEntitlements,
      usage,
      dunning,
    ] = await Promise.all([
      this.getPlan(subscription.planId),
      this.getBillingProfile(principal.organizationId),
      this.subscriptionAddons(
        principal.organizationId,
        subscription.id,
      ),
      this.database.db
        .select()
        .from(saasInvoices)
        .where(
          eq(
            saasInvoices.organizationId,
            principal.organizationId,
          ),
        )
        .orderBy(desc(saasInvoices.createdAt))
        .limit(100),
      this.database.db
        .select()
        .from(saasReceipts)
        .where(
          eq(
            saasReceipts.organizationId,
            principal.organizationId,
          ),
        )
        .orderBy(desc(saasReceipts.paidAt))
        .limit(100),
      this.database.db
        .select({
          key: entitlements.key,
          enabled: entitlements.enabled,
          limitValue: entitlements.limitValue,
          source: entitlements.source,
          config: entitlements.config,
        })
        .from(entitlements)
        .where(
          eq(
            entitlements.organizationId,
            principal.organizationId,
          ),
        ),
      this.usage.summary(principal.organizationId),
      this.database.db
        .select()
        .from(saasDunningCases)
        .where(
          and(
            eq(
              saasDunningCases.organizationId,
              principal.organizationId,
            ),
            eq(saasDunningCases.status, 'OPEN'),
          ),
        ),
    ]);

    return {
      subscription,
      plan,
      billingProfile: profile,
      addons,
      usage,
      entitlements: organizationEntitlements,
      invoices,
      receipts,
      dunning,
    };
  }

  async upsertBillingProfile(
    principal: Principal,
    dto: UpsertSaasBillingProfileDto,
  ) {
    const [profile] = await this.database.db
      .insert(saasCustomerBillingProfiles)
      .values({
        organizationId: principal.organizationId,
        legalName: dto.legalName.trim(),
        billingEmail: dto.billingEmail.trim().toLowerCase(),
        billingPhone: dto.billingPhone?.trim(),
        taxId: dto.taxId?.trim(),
        addressLine1: dto.addressLine1?.trim(),
        addressLine2: dto.addressLine2?.trim(),
        city: dto.city?.trim(),
        state: dto.state?.trim(),
        postalCode: dto.postalCode?.trim(),
        country: dto.country ?? 'IN',
        metadata: dto.metadata,
      })
      .onConflictDoUpdate({
        target: saasCustomerBillingProfiles.organizationId,
        set: {
          legalName: dto.legalName.trim(),
          billingEmail: dto.billingEmail.trim().toLowerCase(),
          billingPhone: dto.billingPhone?.trim(),
          taxId: dto.taxId?.trim(),
          addressLine1: dto.addressLine1?.trim(),
          addressLine2: dto.addressLine2?.trim(),
          city: dto.city?.trim(),
          state: dto.state?.trim(),
          postalCode: dto.postalCode?.trim(),
          country: dto.country ?? 'IN',
          metadata: dto.metadata,
          updatedAt: new Date(),
        },
      })
      .returning();

    await this.audit(
      principal,
      'saas.billing_profile.upsert',
      'saas_billing_profile',
      profile.id,
      profile,
    );
    return profile;
  }

  async createPlanCheckout(
    principal: Principal,
    dto: CreatePlanCheckoutDto,
  ) {
    await this.requireBillingProfile(principal.organizationId);
    const existing = await this.checkoutByIdempotency(
      principal.organizationId,
      dto.idempotencyKey,
    );
    if (existing) return existing;

    const price = await this.getPlanPrice(dto.planPriceId);
    const plan = await this.getPlan(price.planId);
    if (!plan.isActive || price.status !== 'ACTIVE') {
      throw new ConflictException('Selected plan price is not active.');
    }

    const subscription = await this.getSubscription(
      principal.organizationId,
    );
    const currentPrice = await this.findCurrentPlanPrice(subscription);
    let subtotal = Number(price.amount);
    let proration: Record<string, unknown> | undefined;

    if (
      subscription.status === 'ACTIVE' ||
      subscription.status === 'PAST_DUE'
    ) {
      if (price.billingCycle !== subscription.billingCycle) {
        throw new ConflictException(
          'Billing-cycle changes are scheduled for period end.',
        );
      }
      if (price.currency !== subscription.currency) {
        throw new ConflictException(
          'Subscription currency cannot be changed during an active period.',
        );
      }
      if (price.planId === subscription.planId) {
        throw new ConflictException(
          'Subscription is already on this plan.',
        );
      }
      if (!currentPrice) {
        throw new ConflictException(
          'Current subscription price is not configured.',
        );
      }
      const targetAmount = Number(price.amount);
      const currentAmount = Number(currentPrice.amount);
      if (targetAmount <= currentAmount) {
        throw new ConflictException(
          'Downgrades must be scheduled for period end.',
        );
      }
      const fraction = this.remainingPeriodFraction(subscription);
      subtotal = this.money(
        Math.max(0, targetAmount - currentAmount) * fraction,
      );
      proration = {
        currentAmount,
        targetAmount,
        remainingFraction: fraction,
        currentPeriodEnd: subscription.currentPeriodEnd,
      };
    }

    const coupon = await this.resolveCoupon(
      dto.couponCode,
      price.currency,
      subtotal,
    );
    const discount = coupon
      ? this.discountAmount(coupon, subtotal)
      : 0;
    const taxable = Math.max(0, subtotal - discount);
    const tax = this.money(
      (taxable * Number(price.taxRatePercent)) / 100,
    );
    const total = this.money(taxable + tax);

    return this.createCheckout(principal, {
      checkoutType: 'PLAN',
      planPriceId: price.id,
      currency: price.currency,
      subtotal,
      discount,
      tax,
      total,
      coupon,
      idempotencyKey: dto.idempotencyKey,
      metadata: {
        planId: price.planId,
        planName: plan.name,
        billingCycle: price.billingCycle,
        proration,
      },
    });
  }

  async createAddonCheckout(
    principal: Principal,
    dto: CreateAddonCheckoutDto,
  ) {
    await this.requireBillingProfile(principal.organizationId);
    const existing = await this.checkoutByIdempotency(
      principal.organizationId,
      dto.idempotencyKey,
    );
    if (existing) return existing;

    const { price, addon } = await this.getAddonPrice(
      dto.addonPriceId,
    );
    if (!addon.isActive || price.status !== 'ACTIVE') {
      throw new ConflictException('Selected add-on price is not active.');
    }
    const subscription = await this.getSubscription(
      principal.organizationId,
    );
    if (
      !['ACTIVE', 'PAST_DUE'].includes(subscription.status)
    ) {
      throw new ConflictException(
        'Paid add-ons require an active subscription.',
      );
    }
    if (price.billingCycle !== subscription.billingCycle) {
      throw new ConflictException(
        'Add-on billing cycle must match the subscription.',
      );
    }
    if (price.currency !== subscription.currency) {
      throw new ConflictException(
        'Add-on currency must match the subscription.',
      );
    }

    const fraction = this.remainingPeriodFraction(subscription);
    const subtotal = this.money(
      Number(price.amount) * dto.quantity * fraction,
    );
    const coupon = await this.resolveCoupon(
      dto.couponCode,
      price.currency,
      subtotal,
    );
    const discount = coupon
      ? this.discountAmount(coupon, subtotal)
      : 0;
    const taxable = Math.max(0, subtotal - discount);
    const tax = this.money(
      (taxable * Number(price.taxRatePercent)) / 100,
    );
    const total = this.money(taxable + tax);

    return this.createCheckout(principal, {
      checkoutType: 'ADDON',
      addonPriceId: price.id,
      quantity: dto.quantity,
      currency: price.currency,
      subtotal,
      discount,
      tax,
      total,
      coupon,
      idempotencyKey: dto.idempotencyKey,
      metadata: {
        addonId: addon.id,
        addonKey: addon.key,
        addonName: addon.name,
        billingCycle: price.billingCycle,
        remainingFraction: fraction,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
    });
  }

  async startTrial(principal: Principal, dto: StartTrialDto) {
    const price = await this.getPlanPrice(dto.planPriceId);
    const plan = await this.getPlan(price.planId);
    if (
      !plan.isActive ||
      price.status !== 'ACTIVE' ||
      price.trialDays <= 0
    ) {
      throw new ConflictException(
        'Selected plan does not have an active trial.',
      );
    }

    const subscription = await this.getSubscription(
      principal.organizationId,
    );
    if (subscription.status === 'ACTIVE') {
      throw new ConflictException(
        'Active paid subscriptions cannot start a trial.',
      );
    }
    const prior = await this.database.db
      .select({ value: count() })
      .from(saasSubscriptionEvents)
      .where(
        and(
          eq(
            saasSubscriptionEvents.organizationId,
            principal.organizationId,
          ),
          eq(
            saasSubscriptionEvents.eventType,
            'TRIAL_STARTED',
          ),
        ),
      );
    if (Number(prior[0]?.value ?? 0) > 0) {
      throw new ConflictException(
        'This organization has already used its product trial.',
      );
    }

    const now = new Date();
    const trialEndsAt = new Date(
      now.getTime() + price.trialDays * 86_400_000,
    );

    const updated = await this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(subscriptions)
        .set({
          planId: price.planId,
          status: 'TRIALING',
          billingCycle: price.billingCycle,
          currency: price.currency,
          currentPeriodStart: now,
          currentPeriodEnd: trialEndsAt,
          trialEndsAt,
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          graceEndsAt: null,
          pendingPlanId: null,
          pendingBillingCycle: null,
          pendingChangeAt: null,
          version: subscription.version + 1,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, subscription.id))
        .returning();

      await tx.insert(saasSubscriptionEvents).values({
        organizationId: principal.organizationId,
        subscriptionId: subscription.id,
        eventType: 'TRIAL_STARTED',
        payload: {
          planId: price.planId,
          planPriceId: price.id,
          billingCycle: price.billingCycle,
          trialDays: price.trialDays,
          trialEndsAt: trialEndsAt.toISOString(),
        },
        createdByMemberId: principal.membershipId,
      });
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'saas.subscription.trial_started.v1',
        aggregateType: 'subscription',
        aggregateId: subscription.id,
        payload: {
          subscriptionId: subscription.id,
          planId: price.planId,
          trialEndsAt: trialEndsAt.toISOString(),
        },
      });
      await this.commercialEntitlements.reconcileWithTx(
        tx,
        principal.organizationId,
        subscription.id,
      );
      return row;
    });

    await this.audit(
      principal,
      'saas.subscription.trial_start',
      'subscription',
      subscription.id,
      updated,
      subscription,
    );
    return updated;
  }

  async schedulePlanChange(
    principal: Principal,
    dto: SchedulePlanChangeDto,
  ) {
    const target = await this.getPlanPrice(dto.planPriceId);
    const targetPlan = await this.getPlan(target.planId);
    if (!targetPlan.isActive || target.status !== 'ACTIVE') {
      throw new ConflictException('Target plan price is not active.');
    }

    const subscription = await this.getSubscription(
      principal.organizationId,
    );
    if (
      !['ACTIVE', 'PAST_DUE'].includes(subscription.status) ||
      !subscription.currentPeriodEnd
    ) {
      throw new ConflictException(
        'Plan changes require an active paid subscription.',
      );
    }
    if (target.currency !== subscription.currency) {
      throw new ConflictException(
        'Scheduled plan changes cannot change currency.',
      );
    }
    const current = await this.findCurrentPlanPrice(subscription);
    if (!current) {
      throw new ConflictException(
        'Current subscription price is not configured.',
      );
    }
    const currentMonthly = this.monthlyEquivalent(current);
    const targetMonthly = this.monthlyEquivalent(target);
    if (targetMonthly > currentMonthly) {
      throw new ConflictException(
        'Plan upgrades require checkout so proration can be collected.',
      );
    }

    const [updated] = await this.database.db
      .update(subscriptions)
      .set({
        pendingPlanId: target.planId,
        pendingBillingCycle: target.billingCycle,
        pendingChangeAt: subscription.currentPeriodEnd,
        version: subscription.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id))
      .returning();

    await this.database.db.insert(saasSubscriptionEvents).values({
      organizationId: principal.organizationId,
      subscriptionId: subscription.id,
      eventType: 'PLAN_CHANGE_SCHEDULED',
      effectiveAt: subscription.currentPeriodEnd,
      payload: {
        currentPlanId: subscription.planId,
        targetPlanId: target.planId,
        targetPlanPriceId: target.id,
        currentBillingCycle: subscription.billingCycle,
        targetBillingCycle: target.billingCycle,
        reason: dto.reason,
      },
      createdByMemberId: principal.membershipId,
    });
    await this.audit(
      principal,
      'saas.subscription.plan_change_schedule',
      'subscription',
      subscription.id,
      updated,
      subscription,
    );
    return updated;
  }

  async cancelSubscription(
    principal: Principal,
    dto: CancelSubscriptionDto,
  ) {
    const subscription = await this.getSubscription(
      principal.organizationId,
    );
    if (subscription.status === 'CANCELLED') {
      throw new ConflictException('Subscription is already cancelled.');
    }

    if (!dto.immediately && subscription.currentPeriodEnd) {
      const [updated] = await this.database.db
        .update(subscriptions)
        .set({
          cancelAtPeriodEnd: true,
          pendingPlanId: null,
          pendingBillingCycle: null,
          pendingChangeAt: null,
          version: subscription.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, subscription.id))
        .returning();

      await this.database.db.insert(saasSubscriptionEvents).values({
        organizationId: principal.organizationId,
        subscriptionId: subscription.id,
        eventType: 'CANCELLATION_SCHEDULED',
        effectiveAt: subscription.currentPeriodEnd,
        payload: { reason: dto.reason },
        createdByMemberId: principal.membershipId,
      });
      await this.audit(
        principal,
        'saas.subscription.cancel_schedule',
        'subscription',
        subscription.id,
        updated,
        subscription,
      );
      return updated;
    }

    const now = new Date();
    const updated = await this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(subscriptions)
        .set({
          status: 'CANCELLED',
          cancelAtPeriodEnd: false,
          cancelledAt: now,
          graceEndsAt: null,
          pendingPlanId: null,
          pendingBillingCycle: null,
          pendingChangeAt: null,
          version: subscription.version + 1,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, subscription.id))
        .returning();

      await tx
        .update(saasSubscriptionAddons)
        .set({
          status: 'CANCELLED',
          cancelledAt: now,
          cancelAtPeriodEnd: false,
          pendingQuantity: null,
          pendingChangeAt: null,
          updatedAt: now,
        })
        .where(
          eq(
            saasSubscriptionAddons.subscriptionId,
            subscription.id,
          ),
        );

      await tx
        .update(entitlements)
        .set({
          enabled: false,
          updatedAt: now,
        })
        .where(
          and(
            eq(
              entitlements.organizationId,
              principal.organizationId,
            ),
            inArray(entitlements.source, ['PLAN', 'COMMERCIAL']),
          ),
        );

      await tx.insert(saasSubscriptionEvents).values({
        organizationId: principal.organizationId,
        subscriptionId: subscription.id,
        eventType: 'SUBSCRIPTION_CANCELLED',
        payload: {
          immediate: true,
          reason: dto.reason,
        },
        createdByMemberId: principal.membershipId,
      });
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'saas.subscription.cancelled.v1',
        aggregateType: 'subscription',
        aggregateId: subscription.id,
        payload: {
          subscriptionId: subscription.id,
          immediate: true,
        },
      });
      return row;
    });

    await this.audit(
      principal,
      'saas.subscription.cancel',
      'subscription',
      subscription.id,
      updated,
      subscription,
    );
    return updated;
  }

  async reactivateSubscription(principal: Principal) {
    const subscription = await this.getSubscription(
      principal.organizationId,
    );
    if (subscription.status === 'CANCELLED') {
      throw new ConflictException(
        'Cancelled subscriptions require a new paid checkout.',
      );
    }
    if (!subscription.cancelAtPeriodEnd) {
      return subscription;
    }

    const [updated] = await this.database.db
      .update(subscriptions)
      .set({
        cancelAtPeriodEnd: false,
        version: subscription.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id))
      .returning();

    await this.database.db.insert(saasSubscriptionEvents).values({
      organizationId: principal.organizationId,
      subscriptionId: subscription.id,
      eventType: 'CANCELLATION_REVOKED',
      payload: {},
      createdByMemberId: principal.membershipId,
    });
    await this.audit(
      principal,
      'saas.subscription.reactivate',
      'subscription',
      subscription.id,
      updated,
      subscription,
    );
    return updated;
  }

  async scheduleAddonQuantity(
    principal: Principal,
    subscriptionAddonId: string,
    dto: ChangeAddonDto,
  ) {
    const subscription = await this.getSubscription(
      principal.organizationId,
    );
    const rows = await this.database.db
      .select()
      .from(saasSubscriptionAddons)
      .where(
        and(
          eq(
            saasSubscriptionAddons.organizationId,
            principal.organizationId,
          ),
          eq(
            saasSubscriptionAddons.subscriptionId,
            subscription.id,
          ),
          eq(
            saasSubscriptionAddons.id,
            subscriptionAddonId,
          ),
          eq(saasSubscriptionAddons.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    const addon = rows[0];
    if (!addon) {
      throw new NotFoundException('Subscription add-on not found.');
    }
    if (dto.quantity > addon.quantity) {
      throw new ConflictException(
        'Add-on increases require checkout.',
      );
    }
    if (!subscription.currentPeriodEnd) {
      throw new ConflictException(
        'Subscription period end is not available.',
      );
    }

    const [updated] = await this.database.db
      .update(saasSubscriptionAddons)
      .set({
        pendingQuantity: dto.quantity,
        pendingChangeAt: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: dto.quantity === 0,
        updatedAt: new Date(),
      })
      .where(eq(saasSubscriptionAddons.id, addon.id))
      .returning();

    await this.database.db.insert(saasSubscriptionEvents).values({
      organizationId: principal.organizationId,
      subscriptionId: subscription.id,
      eventType:
        dto.quantity === 0
          ? 'ADDON_CANCELLATION_SCHEDULED'
          : 'ADDON_QUANTITY_CHANGE_SCHEDULED',
      effectiveAt: subscription.currentPeriodEnd,
      payload: {
        subscriptionAddonId: addon.id,
        addonId: addon.addonId,
        currentQuantity: addon.quantity,
        targetQuantity: dto.quantity,
      },
      createdByMemberId: principal.membershipId,
    });
    return updated;
  }

  async completeCheckout(
    principal: Principal,
    checkoutId: string,
    dto: CompleteCheckoutDto,
  ) {
    this.assertPlatformAdmin(principal);
    return this.completeCheckoutTrusted(checkoutId, dto);
  }

  async completeCheckoutTrusted(
    checkoutId: string,
    dto: CompleteCheckoutDto,
  ) {
    const checkout = await this.getCheckout(checkoutId);
    if (checkout.status === 'COMPLETED') {
      return this.checkoutCompletion(checkout.id);
    }
    if (checkout.status !== 'OPEN') {
      throw new ConflictException(
        'Only open checkout sessions can be completed.',
      );
    }
    if (checkout.expiresAt.getTime() < Date.now()) {
      throw new ConflictException('Checkout session has expired.');
    }

    const duplicateReceipt = await this.database.db
      .select({ id: saasReceipts.id })
      .from(saasReceipts)
      .where(
        and(
          eq(saasReceipts.provider, dto.provider),
          eq(
            saasReceipts.providerPaymentId,
            dto.providerPaymentId,
          ),
        ),
      )
      .limit(1);
    if (duplicateReceipt[0]) {
      throw new ConflictException(
        'Provider payment was already reconciled.',
      );
    }

    const subscription = await this.getSubscription(
      checkout.organizationId,
    );
    const now = new Date();

    const result = await this.database.db.transaction(async (tx) => {
      let lineDescription = '';
      let lineReferenceId: string | undefined;
      let lineType = checkout.checkoutType;
      let eventType = 'CHECKOUT_COMPLETED';

      if (checkout.checkoutType === 'PLAN') {
        if (!checkout.planPriceId) {
          throw new ConflictException(
            'Plan checkout is missing a price reference.',
          );
        }
        const priceRows = await tx
          .select()
          .from(saasPlanPrices)
          .where(eq(saasPlanPrices.id, checkout.planPriceId))
          .limit(1);
        const price = priceRows[0];
        if (!price) throw new NotFoundException('Plan price not found.');
        const planRows = await tx
          .select()
          .from(plans)
          .where(eq(plans.id, price.planId))
          .limit(1);
        const plan = planRows[0];
        if (!plan) throw new NotFoundException('Plan not found.');

        const wasTrialing = subscription.status === 'TRIALING';
        const preservePeriod =
          !wasTrialing &&
          subscription.currentPeriodEnd &&
          subscription.currentPeriodEnd.getTime() > now.getTime() &&
          subscription.billingCycle === price.billingCycle;

        const periodStart = preservePeriod
          ? subscription.currentPeriodStart ?? now
          : now;
        const periodEnd = preservePeriod
          ? subscription.currentPeriodEnd!
          : this.nextPeriodEnd(now, price.billingCycle);

        await tx
          .update(subscriptions)
          .set({
            planId: price.planId,
            status: 'ACTIVE',
            billingCycle: price.billingCycle,
            currency: price.currency,
            provider: dto.provider,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            trialEndsAt: null,
            cancelAtPeriodEnd: false,
            cancelledAt: null,
            graceEndsAt: null,
            pendingPlanId: null,
            pendingBillingCycle: null,
            pendingChangeAt: null,
            version: subscription.version + 1,
            updatedAt: now,
          })
          .where(eq(subscriptions.id, subscription.id));

        await tx.insert(saasSubscriptionEvents).values({
          organizationId: checkout.organizationId,
          subscriptionId: subscription.id,
          eventType: wasTrialing
            ? 'TRIAL_CONVERTED'
            : 'PLAN_UPGRADED',
          payload: {
            checkoutId: checkout.id,
            planId: price.planId,
            planPriceId: price.id,
            billingCycle: price.billingCycle,
          },
          createdByMemberId: checkout.requestedByMemberId,
        });
        await this.commercialEntitlements.reconcileWithTx(
          tx,
          checkout.organizationId,
          subscription.id,
        );
        lineDescription = `${plan.name} · ${price.billingCycle}`;
        lineReferenceId = price.id;
        eventType = wasTrialing
          ? 'TRIAL_CONVERTED'
          : 'PLAN_UPGRADED';
      } else if (checkout.checkoutType === 'ADDON') {
        if (!checkout.addonPriceId) {
          throw new ConflictException(
            'Add-on checkout is missing a price reference.',
          );
        }
        const priceRows = await tx
          .select({
            price: saasAddonPrices,
            addon: saasAddons,
          })
          .from(saasAddonPrices)
          .innerJoin(
            saasAddons,
            eq(saasAddons.id, saasAddonPrices.addonId),
          )
          .where(eq(saasAddonPrices.id, checkout.addonPriceId))
          .limit(1);
        const row = priceRows[0];
        if (!row) throw new NotFoundException('Add-on price not found.');

        const existingRows = await tx
          .select()
          .from(saasSubscriptionAddons)
          .where(
            and(
              eq(
                saasSubscriptionAddons.organizationId,
                checkout.organizationId,
              ),
              eq(
                saasSubscriptionAddons.subscriptionId,
                subscription.id,
              ),
              eq(
                saasSubscriptionAddons.addonId,
                row.addon.id,
              ),
            ),
          )
          .limit(1);
        const current = existingRows[0];
        if (current) {
          await tx
            .update(saasSubscriptionAddons)
            .set({
              quantity: current.quantity + checkout.quantity,
              status: 'ACTIVE',
              currentPeriodStart:
                subscription.currentPeriodStart ?? now,
              currentPeriodEnd: subscription.currentPeriodEnd,
              pendingQuantity: null,
              pendingChangeAt: null,
              cancelAtPeriodEnd: false,
              cancelledAt: null,
              updatedAt: now,
            })
            .where(eq(saasSubscriptionAddons.id, current.id));
        } else {
          await tx.insert(saasSubscriptionAddons).values({
            organizationId: checkout.organizationId,
            subscriptionId: subscription.id,
            addonId: row.addon.id,
            quantity: checkout.quantity,
            status: 'ACTIVE',
            currentPeriodStart:
              subscription.currentPeriodStart ?? now,
            currentPeriodEnd: subscription.currentPeriodEnd,
          });
        }

        await tx.insert(saasSubscriptionEvents).values({
          organizationId: checkout.organizationId,
          subscriptionId: subscription.id,
          eventType: 'ADDON_PURCHASED',
          payload: {
            checkoutId: checkout.id,
            addonId: row.addon.id,
            addonPriceId: row.price.id,
            quantity: checkout.quantity,
          },
          createdByMemberId: checkout.requestedByMemberId,
        });
        await this.commercialEntitlements.reconcileWithTx(
          tx,
          checkout.organizationId,
          subscription.id,
        );
        lineDescription = `${row.addon.name} × ${checkout.quantity}`;
        lineReferenceId = row.price.id;
        eventType = 'ADDON_PURCHASED';
      } else {
        throw new ConflictException(
          'Unsupported checkout type.',
        );
      }
      const [completed] = await tx
        .update(saasCheckoutSessions)
        .set({
          status: 'COMPLETED',
          provider: dto.provider,
          providerSessionId: dto.providerSessionId,
          providerPaymentId: dto.providerPaymentId,
          completedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(saasCheckoutSessions.id, checkout.id),
            eq(saasCheckoutSessions.status, 'OPEN'),
          ),
        )
        .returning();
      if (!completed) {
        throw new ConflictException(
          'Checkout was already reconciled.',
        );
      }

      const invoiceNumber = this.invoiceNumber(checkout.id, now);
      const [invoice] = await tx
        .insert(saasInvoices)
        .values({
          organizationId: checkout.organizationId,
          subscriptionId: subscription.id,
          invoiceNumber,
          status: 'PAID',
          currency: checkout.currency,
          subtotal: checkout.subtotal,
          discountAmount: checkout.discountAmount,
          taxAmount: checkout.taxAmount,
          total: checkout.total,
          paidAmount: checkout.total,
          balanceDue: '0',
          periodStart: subscription.currentPeriodStart,
          periodEnd: subscription.currentPeriodEnd,
          dueAt: now,
          paidAt: now,
          checkoutSessionId: checkout.id,
          metadata: {
            eventType,
            provider: dto.provider,
          },
        })
        .returning();

      await tx.insert(saasInvoiceLines).values({
        invoiceId: invoice.id,
        lineType,
        referenceId: lineReferenceId,
        description: lineDescription,
        quantity: String(
          checkout.checkoutType === 'ADDON'
            ? checkout.quantity
            : 1,
        ),
        unitAmount: String(
          this.money(
            Number(checkout.subtotal) /
              Math.max(checkout.quantity, 1),
          ),
        ),
        lineTotal: checkout.subtotal,
        metadata: checkout.metadata,
      });

      const receiptNumber = this.receiptNumber(checkout.id, now);
      const [receipt] = await tx
        .insert(saasReceipts)
        .values({
          organizationId: checkout.organizationId,
          invoiceId: invoice.id,
          receiptNumber,
          amount: checkout.total,
          currency: checkout.currency,
          provider: dto.provider,
          providerPaymentId: dto.providerPaymentId,
          paidAt: now,
        })
        .returning();

      if (checkout.couponId) {
        await tx
          .insert(saasCouponRedemptions)
          .values({
            couponId: checkout.couponId,
            organizationId: checkout.organizationId,
            checkoutSessionId: checkout.id,
          })
          .onConflictDoNothing();
      }

      await tx.insert(outboxEvents).values({
        organizationId: checkout.organizationId,
        eventType: 'saas.checkout.completed.v1',
        aggregateType: 'saas_checkout',
        aggregateId: checkout.id,
        payload: {
          checkoutId: checkout.id,
          subscriptionId: subscription.id,
          invoiceId: invoice.id,
          receiptId: receipt.id,
          checkoutType: checkout.checkoutType,
          total: checkout.total,
          currency: checkout.currency,
        },
      });

      return { checkout: completed, invoice, receipt };
    });

    return result;
  }

  async failCheckout(
    principal: Principal,
    checkoutId: string,
    dto: FailCheckoutDto,
  ) {
    this.assertPlatformAdmin(principal);
    return this.failCheckoutTrusted(checkoutId, dto);
  }

  async failCheckoutTrusted(
    checkoutId: string,
    dto: FailCheckoutDto,
  ) {
    const checkout = await this.getCheckout(checkoutId);
    if (checkout.status === 'FAILED') return checkout;
    if (checkout.status !== 'OPEN') {
      throw new ConflictException(
        'Only open checkout sessions can fail.',
      );
    }
    const [updated] = await this.database.db
      .update(saasCheckoutSessions)
      .set({
        status: 'FAILED',
        metadata: {
          ...checkout.metadata,
          failureReason: dto.reason,
          providerAttemptId: dto.providerAttemptId,
        },
        updatedAt: new Date(),
      })
      .where(eq(saasCheckoutSessions.id, checkoutId))
      .returning();

    await this.database.db.insert(outboxEvents).values({
      organizationId: checkout.organizationId,
      eventType: 'saas.checkout.failed.v1',
      aggregateType: 'saas_checkout',
      aggregateId: checkout.id,
      payload: {
        checkoutId: checkout.id,
        reason: dto.reason,
        providerAttemptId: dto.providerAttemptId,
      },
    });
    return updated;
  }

  async reconcileInvoicePayment(
    principal: Principal,
    invoiceId: string,
    dto: ReconcileInvoicePaymentDto,
  ) {
    this.assertPlatformAdmin(principal);
    return this.reconcileInvoicePaymentTrusted(invoiceId, dto);
  }

  async reconcileInvoicePaymentTrusted(
    invoiceId: string,
    dto: ReconcileInvoicePaymentDto,
  ) {
    const invoiceRows = await this.database.db
      .select()
      .from(saasInvoices)
      .where(eq(saasInvoices.id, invoiceId))
      .limit(1);
    const invoice = invoiceRows[0];
    if (!invoice) {
      throw new NotFoundException('SaaS invoice not found.');
    }

    const duplicateRows = await this.database.db
      .select()
      .from(saasReceipts)
      .where(
        and(
          eq(saasReceipts.provider, dto.provider),
          eq(
            saasReceipts.providerPaymentId,
            dto.providerPaymentId,
          ),
        ),
      )
      .limit(1);
    const duplicate = duplicateRows[0];
    if (duplicate) {
      if (duplicate.invoiceId !== invoice.id) {
        throw new ConflictException(
          'Provider payment is already reconciled to another invoice.',
        );
      }
      return {
        invoice,
        receipt: duplicate,
        idempotent: true,
      };
    }

    if (invoice.status === 'PAID') {
      const receiptRows = await this.database.db
        .select()
        .from(saasReceipts)
        .where(eq(saasReceipts.invoiceId, invoice.id))
        .limit(1);
      throw new ConflictException(
        receiptRows[0]
          ? 'Invoice is already paid with another provider payment.'
          : 'Invoice is already marked paid.',
      );
    }
    if (!['OPEN', 'PAST_DUE'].includes(invoice.status)) {
      throw new ConflictException(
        'Only open or past-due SaaS invoices can be reconciled.',
      );
    }
    if (invoice.metadata?.renewal !== true) {
      throw new ConflictException(
        'This endpoint reconciles subscription renewal invoices only.',
      );
    }

    const subscription = await this.getSubscription(
      invoice.organizationId,
    );
    if (subscription.id !== invoice.subscriptionId) {
      throw new ConflictException(
        'Invoice subscription does not match organization subscription.',
      );
    }

    const targetPlanId =
      typeof invoice.metadata?.targetPlanId === 'string'
        ? invoice.metadata.targetPlanId
        : subscription.pendingPlanId ?? subscription.planId;
    const targetBillingCycle =
      typeof invoice.metadata?.targetBillingCycle === 'string'
        ? invoice.metadata.targetBillingCycle
        : subscription.pendingBillingCycle ??
          subscription.billingCycle;

    if (!['MONTHLY', 'YEARLY'].includes(targetBillingCycle)) {
      throw new ConflictException(
        'Renewal invoice has an invalid billing cycle.',
      );
    }

    const now = new Date();
    const periodStart =
      subscription.currentPeriodEnd ?? invoice.periodEnd ?? now;
    const periodEnd = this.nextPeriodEnd(
      periodStart,
      targetBillingCycle,
    );

    const result = await this.database.db.transaction(async (tx) => {
      const paidRows = await tx
        .update(saasInvoices)
        .set({
          status: 'PAID',
          paidAmount: invoice.total,
          balanceDue: '0',
          paidAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(saasInvoices.id, invoice.id),
            inArray(saasInvoices.status, ['OPEN', 'PAST_DUE']),
          ),
        )
        .returning();
      const paidInvoice = paidRows[0];
      if (!paidInvoice) {
        throw new ConflictException(
          'Invoice was reconciled concurrently.',
        );
      }

      const receiptNumber = this.receiptNumber(invoice.id, now);
      const [receipt] = await tx
        .insert(saasReceipts)
        .values({
          organizationId: invoice.organizationId,
          invoiceId: invoice.id,
          receiptNumber,
          amount: invoice.total,
          currency: invoice.currency,
          provider: dto.provider,
          providerPaymentId: dto.providerPaymentId,
          paidAt: now,
        })
        .returning();

      const dunningRows = await tx
        .select()
        .from(saasDunningCases)
        .where(eq(saasDunningCases.invoiceId, invoice.id))
        .limit(1);
      const dunning = dunningRows[0];
      if (dunning) {
        await tx
          .update(saasDunningCases)
          .set({
            status: 'RECOVERED',
            nextAttemptAt: null,
            recoveredAt: now,
            closedAt: now,
            lastError: null,
            updatedAt: now,
          })
          .where(eq(saasDunningCases.id, dunning.id));

        if (dto.providerAttemptId) {
          const attemptNumber = Math.max(
            1,
            dunning.attemptCount || 1,
          );
          await tx
            .insert(saasDunningAttempts)
            .values({
              dunningCaseId: dunning.id,
              attemptNumber,
              status: 'SUCCEEDED',
              providerAttemptId: dto.providerAttemptId,
              error: null,
              attemptedAt: now,
            })
            .onConflictDoUpdate({
              target: [
                saasDunningAttempts.dunningCaseId,
                saasDunningAttempts.attemptNumber,
              ],
              set: {
                status: 'SUCCEEDED',
                providerAttemptId: dto.providerAttemptId,
                error: null,
                attemptedAt: now,
              },
            });
        }
      }

      const [updatedSubscription] = await tx
        .update(subscriptions)
        .set({
          planId: targetPlanId,
          status: 'ACTIVE',
          billingCycle: targetBillingCycle,
          provider: dto.provider,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          trialEndsAt: null,
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          graceEndsAt: null,
          pendingPlanId: null,
          pendingBillingCycle: null,
          pendingChangeAt: null,
          version: subscription.version + 1,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, subscription.id))
        .returning();

      const addonRows = await tx
        .select()
        .from(saasSubscriptionAddons)
        .where(
          and(
            eq(
              saasSubscriptionAddons.subscriptionId,
              subscription.id,
            ),
            eq(saasSubscriptionAddons.status, 'ACTIVE'),
          ),
        );

      for (const addon of addonRows) {
        const pendingIsDue =
          addon.pendingQuantity !== null &&
          addon.pendingChangeAt !== null &&
          addon.pendingChangeAt.getTime() <= now.getTime();

        if (pendingIsDue && (addon.pendingQuantity ?? 0) <= 0) {
          await tx
            .update(saasSubscriptionAddons)
            .set({
              status: 'CANCELLED',
              quantity: 0,
              pendingQuantity: null,
              pendingChangeAt: null,
              cancelAtPeriodEnd: false,
              cancelledAt: now,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              updatedAt: now,
            })
            .where(eq(saasSubscriptionAddons.id, addon.id));
          continue;
        }

        await tx
          .update(saasSubscriptionAddons)
          .set({
            quantity: pendingIsDue
              ? (addon.pendingQuantity ?? addon.quantity)
              : addon.quantity,
            pendingQuantity: pendingIsDue
              ? null
              : addon.pendingQuantity,
            pendingChangeAt: pendingIsDue
              ? null
              : addon.pendingChangeAt,
            cancelAtPeriodEnd: pendingIsDue
              ? false
              : addon.cancelAtPeriodEnd,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            updatedAt: now,
          })
          .where(eq(saasSubscriptionAddons.id, addon.id));
      }

      await this.commercialEntitlements.reconcileWithTx(
        tx,
        invoice.organizationId,
        subscription.id,
      );

      await tx.insert(saasSubscriptionEvents).values({
        organizationId: invoice.organizationId,
        subscriptionId: subscription.id,
        eventType: dunning
          ? 'PAYMENT_RECOVERED'
          : 'SUBSCRIPTION_RENEWED',
        effectiveAt: now,
        payload: {
          invoiceId: invoice.id,
          receiptId: receipt.id,
          provider: dto.provider,
          providerPaymentId: dto.providerPaymentId,
          targetPlanId,
          targetBillingCycle,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
      });

      await tx.insert(outboxEvents).values([
        {
          organizationId: invoice.organizationId,
          eventType: 'saas.invoice.paid.v1',
          aggregateType: 'saas_invoice',
          aggregateId: invoice.id,
          payload: {
            invoiceId: invoice.id,
            receiptId: receipt.id,
            subscriptionId: subscription.id,
            total: invoice.total,
            currency: invoice.currency,
          },
        },
        {
          organizationId: invoice.organizationId,
          eventType: 'saas.subscription.renewed.v1',
          aggregateType: 'subscription',
          aggregateId: subscription.id,
          payload: {
            subscriptionId: subscription.id,
            invoiceId: invoice.id,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
            recoveredFromDunning: Boolean(dunning),
          },
        },
      ]);

      await tx.insert(auditLogs).values({
        organizationId: invoice.organizationId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'saas.invoice.payment_reconcile',
        resourceType: 'saas_invoice',
        resourceId: invoice.id,
        before: {
          status: invoice.status,
          balanceDue: invoice.balanceDue,
        },
        after: {
          status: 'PAID',
          provider: dto.provider,
          providerPaymentId: dto.providerPaymentId,
          receiptId: receipt.id,
        },
      });

      return {
        invoice: paidInvoice,
        receipt,
        subscription: updatedSubscription,
        recoveredFromDunning: Boolean(dunning),
        idempotent: false,
      };
    });

    return result;
  }

  async usageSummary(principal: Principal) {
    return this.usage.summary(principal.organizationId);
  }

  async listInvoices(principal: Principal) {
    return this.database.db
      .select()
      .from(saasInvoices)
      .where(
        eq(
          saasInvoices.organizationId,
          principal.organizationId,
        ),
      )
      .orderBy(desc(saasInvoices.createdAt))
      .limit(200);
  }

  async listReceipts(principal: Principal) {
    return this.database.db
      .select()
      .from(saasReceipts)
      .where(
        eq(
          saasReceipts.organizationId,
          principal.organizationId,
        ),
      )
      .orderBy(desc(saasReceipts.paidAt))
      .limit(200);
  }

  private async createCheckout(
    principal: Principal,
    input: {
      checkoutType: 'PLAN' | 'ADDON';
      planPriceId?: string;
      addonPriceId?: string;
      quantity?: number;
      currency: string;
      subtotal: number;
      discount: number;
      tax: number;
      total: number;
      coupon?: Coupon;
      idempotencyKey: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const [checkout] = await this.database.db
      .insert(saasCheckoutSessions)
      .values({
        organizationId: principal.organizationId,
        requestedByMemberId: principal.membershipId,
        checkoutType: input.checkoutType,
        planPriceId: input.planPriceId,
        addonPriceId: input.addonPriceId,
        quantity: input.quantity ?? 1,
        couponId: input.coupon?.id,
        currency: input.currency,
        subtotal: String(input.subtotal),
        discountAmount: String(input.discount),
        taxAmount: String(input.tax),
        total: String(input.total),
        status: 'OPEN',
        idempotencyKey: input.idempotencyKey,
        expiresAt,
        metadata: {
          ...input.metadata,
          paymentProviderStatus: 'EXTERNAL_ACTIVATION_PENDING',
        },
      })
      .returning();

    await this.database.db.transaction(async (tx) => {
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'saas.checkout.created.v1',
        aggregateType: 'saas_checkout',
        aggregateId: checkout.id,
        payload: {
          checkoutId: checkout.id,
          checkoutType: checkout.checkoutType,
          total: checkout.total,
          currency: checkout.currency,
          expiresAt: expiresAt.toISOString(),
          paymentProviderRequired: true,
        },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'saas.checkout.create',
        resourceType: 'saas_checkout',
        resourceId: checkout.id,
        after: {
          checkoutType: checkout.checkoutType,
          total: checkout.total,
          currency: checkout.currency,
          couponId: checkout.couponId,
        },
      });
    });

    return {
      ...checkout,
      payment: {
        status: 'EXTERNAL_ACTIVATION_PENDING',
        providerSessionId: null,
      },
    };
  }

  private async resolveCoupon(
    code: string | undefined,
    currency: string,
    subtotal: number,
  ) {
    if (!code) return undefined;
    const rows = await this.database.db
      .select()
      .from(saasCoupons)
      .where(
        and(
          eq(saasCoupons.code, code.trim().toUpperCase()),
          eq(saasCoupons.isActive, true),
        ),
      )
      .limit(1);
    const coupon = rows[0];
    if (!coupon) {
      throw new NotFoundException('Coupon is invalid or inactive.');
    }
    const now = Date.now();
    if (coupon.startsAt && coupon.startsAt.getTime() > now) {
      throw new ConflictException('Coupon is not active yet.');
    }
    if (coupon.expiresAt && coupon.expiresAt.getTime() <= now) {
      throw new ConflictException('Coupon has expired.');
    }
    if (
      coupon.discountType === 'FIXED' &&
      coupon.currency !== currency
    ) {
      throw new ConflictException(
        'Coupon currency does not match checkout currency.',
      );
    }

    if (coupon.maxRedemptions) {
      const rows = await this.database.db
        .select({ value: count() })
        .from(saasCouponRedemptions)
        .where(
          eq(saasCouponRedemptions.couponId, coupon.id),
        );
      if (
        Number(rows[0]?.value ?? 0) >=
        coupon.maxRedemptions
      ) {
        throw new ConflictException(
          'Coupon redemption limit has been reached.',
        );
      }
    }

    const discount = this.discountAmount(coupon, subtotal);
    if (discount <= 0) {
      throw new ConflictException(
        'Coupon does not apply a positive discount.',
      );
    }
    return coupon;
  }

  private discountAmount(coupon: Coupon, subtotal: number) {
    if (coupon.discountType === 'PERCENT') {
      return this.money(
        Math.min(
          subtotal,
          (subtotal * Number(coupon.discountValue)) / 100,
        ),
      );
    }
    return this.money(
      Math.min(subtotal, Number(coupon.discountValue)),
    );
  }

  private async checkoutByIdempotency(
    organizationId: string,
    key: string,
  ) {
    const rows = await this.database.db
      .select()
      .from(saasCheckoutSessions)
      .where(
        and(
          eq(
            saasCheckoutSessions.organizationId,
            organizationId,
          ),
          eq(saasCheckoutSessions.idempotencyKey, key),
        ),
      )
      .limit(1);
    return rows[0];
  }

  private async getCheckout(checkoutId: string) {
    const rows = await this.database.db
      .select()
      .from(saasCheckoutSessions)
      .where(eq(saasCheckoutSessions.id, checkoutId))
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Checkout not found.');
    return rows[0];
  }

  private async checkoutCompletion(checkoutId: string) {
    const checkoutRows = await this.database.db
      .select()
      .from(saasCheckoutSessions)
      .where(eq(saasCheckoutSessions.id, checkoutId))
      .limit(1);
    const checkout = checkoutRows[0];
    if (!checkout) throw new NotFoundException('Checkout not found.');

    const invoiceRows = await this.database.db
      .select()
      .from(saasInvoices)
      .where(eq(saasInvoices.checkoutSessionId, checkoutId))
      .limit(1);
    const invoice = invoiceRows[0];
    const receipt = invoice
      ? (
          await this.database.db
            .select()
            .from(saasReceipts)
            .where(eq(saasReceipts.invoiceId, invoice.id))
            .limit(1)
        )[0]
      : undefined;
    return { checkout, invoice, receipt };
  }

  private async getPlanPrice(planPriceId: string) {
    const rows = await this.database.db
      .select()
      .from(saasPlanPrices)
      .where(eq(saasPlanPrices.id, planPriceId))
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException('Plan price not found.');
    }
    return rows[0];
  }

  private async findCurrentPlanPrice(
    subscription: Subscription,
  ) {
    const rows = await this.database.db
      .select()
      .from(saasPlanPrices)
      .where(
        and(
          eq(saasPlanPrices.planId, subscription.planId),
          eq(
            saasPlanPrices.billingCycle,
            subscription.billingCycle,
          ),
          eq(saasPlanPrices.currency, subscription.currency),
          eq(saasPlanPrices.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    return rows[0];
  }

  private async getAddonPrice(addonPriceId: string) {
    const rows = await this.database.db
      .select({
        price: saasAddonPrices,
        addon: saasAddons,
      })
      .from(saasAddonPrices)
      .innerJoin(
        saasAddons,
        eq(saasAddons.id, saasAddonPrices.addonId),
      )
      .where(eq(saasAddonPrices.id, addonPriceId))
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException('Add-on price not found.');
    }
    return rows[0];
  }

  private async getPlan(planId: string) {
    const rows = await this.database.db
      .select()
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Plan not found.');
    return rows[0];
  }

  private async getSubscription(organizationId: string) {
    const rows = await this.database.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException('Subscription not found.');
    }
    return rows[0];
  }

  private async getBillingProfile(organizationId: string) {
    const rows = await this.database.db
      .select()
      .from(saasCustomerBillingProfiles)
      .where(
        eq(
          saasCustomerBillingProfiles.organizationId,
          organizationId,
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  private async requireBillingProfile(organizationId: string) {
    const profile = await this.getBillingProfile(organizationId);
    if (!profile) {
      throw new ConflictException(
        'Complete the SaaS billing profile before checkout.',
      );
    }
    return profile;
  }

  private async subscriptionAddons(
    organizationId: string,
    subscriptionId: string,
  ) {
    return this.database.db
      .select({
        subscriptionAddon: saasSubscriptionAddons,
        addon: saasAddons,
      })
      .from(saasSubscriptionAddons)
      .innerJoin(
        saasAddons,
        eq(saasAddons.id, saasSubscriptionAddons.addonId),
      )
      .where(
        and(
          eq(
            saasSubscriptionAddons.organizationId,
            organizationId,
          ),
          eq(
            saasSubscriptionAddons.subscriptionId,
            subscriptionId,
          ),
        ),
      );
  }

  private remainingPeriodFraction(subscription: Subscription) {
    const start =
      subscription.currentPeriodStart ?? subscription.createdAt;
    const end = subscription.currentPeriodEnd;
    if (!end || end.getTime() <= Date.now()) return 1;
    const total = Math.max(
      1,
      end.getTime() - start.getTime(),
    );
    const remaining = Math.max(0, end.getTime() - Date.now());
    return Math.min(1, Math.max(0, remaining / total));
  }

  private monthlyEquivalent(price: PlanPrice) {
    const amount = Number(price.amount);
    return price.billingCycle === 'YEARLY'
      ? amount / 12
      : amount;
  }

  private nextPeriodEnd(start: Date, cycle: string) {
    const end = new Date(start);
    if (cycle === 'YEARLY') {
      end.setUTCFullYear(end.getUTCFullYear() + 1);
    } else {
      end.setUTCMonth(end.getUTCMonth() + 1);
    }
    return end;
  }

  private invoiceNumber(checkoutId: string, date: Date) {
    const stamp = date
      .toISOString()
      .slice(0, 10)
      .replaceAll('-', '');
    return `SAAS-${stamp}-${checkoutId.slice(0, 8).toUpperCase()}`;
  }

  private receiptNumber(checkoutId: string, date: Date) {
    const stamp = date
      .toISOString()
      .slice(0, 10)
      .replaceAll('-', '');
    return `SAAS-RCT-${stamp}-${checkoutId
      .slice(0, 8)
      .toUpperCase()}`;
  }

  private money(value: number) {
    return Number(value.toFixed(2));
  }

  private assertPlatformAdmin(principal: Principal) {
    if (!principal.isPlatformAdmin) {
      throw new ForbiddenException(
        'Provider billing reconciliation requires platform admin.',
      );
    }
  }

  private async audit(
    principal: Principal,
    action: string,
    resourceType: string,
    resourceId: string,
    after: Record<string, unknown>,
    before?: Record<string, unknown>,
  ) {
    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      actorType: 'USER',
      actorId: principal.userId,
      action,
      resourceType,
      resourceId,
      before,
      after,
    });
  }
}
