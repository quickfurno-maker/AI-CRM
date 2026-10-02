import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  auditLogs,
  plans,
  subscriptions,
} from '../../platform/database/schema.js';
import type {
  ConfigureAddonDto,
  ConfigureAddonPriceDto,
  ConfigureCouponDto,
  ConfigureMeterPriceDto,
  ConfigurePlanDto,
  ConfigurePlanPriceDto,
} from './saas-commercial.dto.js';
import {
  saasAddonPrices,
  saasAddons,
  saasCoupons,
  saasDunningCases,
  saasInvoices,
  saasMeterPrices,
  saasPlanPrices,
  saasSubscriptionAddons,
  saasSubscriptionEvents,
} from './saas-commercial.schema.js';

@Injectable()
export class SaasCommercialAdminService {
  constructor(private readonly database: DatabaseService) {}

  async catalog() {
    const [
      planRows,
      planPrices,
      meterPrices,
      addons,
      addonPrices,
      coupons,
    ] = await Promise.all([
      this.database.db.select().from(plans).orderBy(plans.name),
      this.database.db
        .select()
        .from(saasPlanPrices)
        .orderBy(saasPlanPrices.createdAt),
      this.database.db
        .select()
        .from(saasMeterPrices)
        .orderBy(saasMeterPrices.meterKey),
      this.database.db.select().from(saasAddons).orderBy(saasAddons.name),
      this.database.db
        .select()
        .from(saasAddonPrices)
        .orderBy(saasAddonPrices.createdAt),
      this.database.db
        .select()
        .from(saasCoupons)
        .orderBy(desc(saasCoupons.createdAt)),
    ]);
    return {
      plans: planRows.map((plan) => ({
        ...plan,
        prices: planPrices.filter((price) => price.planId === plan.id),
        meters: meterPrices.filter((meter) => meter.planId === plan.id),
      })),
      addons: addons.map((addon) => ({
        ...addon,
        prices: addonPrices.filter((price) => price.addonId === addon.id),
      })),
      coupons,
    };
  }

  async configurePlan(principal: Principal, dto: ConfigurePlanDto) {
    this.assertPlatformAdmin(principal);
    const existing = await this.database.db
      .select()
      .from(plans)
      .where(eq(plans.key, dto.key))
      .limit(1);

    const [plan] = existing[0]
      ? await this.database.db
          .update(plans)
          .set({
            name: dto.name.trim(),
            isActive: dto.isActive ?? existing[0].isActive,
            updatedAt: new Date(),
          })
          .where(eq(plans.id, existing[0].id))
          .returning()
      : await this.database.db
          .insert(plans)
          .values({
            key: dto.key,
            name: dto.name.trim(),
            isActive: dto.isActive ?? false,
          })
          .returning();

    await this.audit(
      principal,
      'saas.plan.configure',
      'plan',
      plan.id,
      plan,
      existing[0],
    );
    return plan;
  }

  async configurePlanPrice(
    principal: Principal,
    dto: ConfigurePlanPriceDto,
  ) {
    this.assertPlatformAdmin(principal);
    await this.assertPlan(dto.planId);
    this.assertRate(dto.taxRatePercent);

    const [price] = await this.database.db
      .insert(saasPlanPrices)
      .values({
        planId: dto.planId,
        billingCycle: dto.billingCycle,
        currency: dto.currency,
        amount: dto.amount,
        taxRatePercent: dto.taxRatePercent ?? '0',
        status: dto.status ?? 'DRAFT',
        trialDays: dto.trialDays ?? 0,
        metadata: dto.metadata,
      })
      .onConflictDoUpdate({
        target: [
          saasPlanPrices.planId,
          saasPlanPrices.billingCycle,
          saasPlanPrices.currency,
        ],
        set: {
          amount: dto.amount,
          taxRatePercent: dto.taxRatePercent ?? '0',
          status: dto.status ?? 'DRAFT',
          trialDays: dto.trialDays ?? 0,
          metadata: dto.metadata,
          updatedAt: new Date(),
        },
      })
      .returning();

    await this.audit(
      principal,
      'saas.plan_price.configure',
      'saas_plan_price',
      price.id,
      price,
    );
    return price;
  }

  async configureMeter(
    principal: Principal,
    dto: ConfigureMeterPriceDto,
  ) {
    this.assertPlatformAdmin(principal);
    await this.assertPlan(dto.planId);

    const [meter] = await this.database.db
      .insert(saasMeterPrices)
      .values({
        planId: dto.planId,
        meterKey: dto.meterKey,
        unit: dto.unit ?? 'unit',
        currency: dto.currency,
        includedQuantity: dto.includedQuantity,
        unitAmount: dto.unitAmount,
        warningThresholdPercent: dto.warningThresholdPercent ?? 80,
        enforcementMode: dto.enforcementMode,
        isActive: dto.isActive ?? false,
        metadata: dto.metadata,
      })
      .onConflictDoUpdate({
        target: [
          saasMeterPrices.planId,
          saasMeterPrices.meterKey,
          saasMeterPrices.currency,
        ],
        set: {
          unit: dto.unit ?? 'unit',
          includedQuantity: dto.includedQuantity,
          unitAmount: dto.unitAmount,
          warningThresholdPercent: dto.warningThresholdPercent ?? 80,
          enforcementMode: dto.enforcementMode,
          isActive: dto.isActive ?? false,
          metadata: dto.metadata,
          updatedAt: new Date(),
        },
      })
      .returning();

    await this.audit(
      principal,
      'saas.meter.configure',
      'saas_meter_price',
      meter.id,
      meter,
    );
    return meter;
  }

  async configureAddon(
    principal: Principal,
    dto: ConfigureAddonDto,
  ) {
    this.assertPlatformAdmin(principal);
    const [addon] = await this.database.db
      .insert(saasAddons)
      .values({
        key: dto.key,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        entitlementKey: dto.entitlementKey,
        entitlementMode: dto.entitlementMode,
        unitsPerQuantity: dto.unitsPerQuantity ?? 1,
        isActive: dto.isActive ?? false,
        metadata: dto.metadata,
      })
      .onConflictDoUpdate({
        target: saasAddons.key,
        set: {
          name: dto.name.trim(),
          description: dto.description?.trim(),
          entitlementKey: dto.entitlementKey,
          entitlementMode: dto.entitlementMode,
          unitsPerQuantity: dto.unitsPerQuantity ?? 1,
          isActive: dto.isActive ?? false,
          metadata: dto.metadata,
          updatedAt: new Date(),
        },
      })
      .returning();

    await this.audit(
      principal,
      'saas.addon.configure',
      'saas_addon',
      addon.id,
      addon,
    );
    return addon;
  }

  async configureAddonPrice(
    principal: Principal,
    dto: ConfigureAddonPriceDto,
  ) {
    this.assertPlatformAdmin(principal);
    await this.assertAddon(dto.addonId);
    this.assertRate(dto.taxRatePercent);

    const [price] = await this.database.db
      .insert(saasAddonPrices)
      .values({
        addonId: dto.addonId,
        billingCycle: dto.billingCycle,
        currency: dto.currency,
        amount: dto.amount,
        taxRatePercent: dto.taxRatePercent ?? '0',
        status: dto.status ?? 'DRAFT',
      })
      .onConflictDoUpdate({
        target: [
          saasAddonPrices.addonId,
          saasAddonPrices.billingCycle,
          saasAddonPrices.currency,
        ],
        set: {
          amount: dto.amount,
          taxRatePercent: dto.taxRatePercent ?? '0',
          status: dto.status ?? 'DRAFT',
          updatedAt: new Date(),
        },
      })
      .returning();

    await this.audit(
      principal,
      'saas.addon_price.configure',
      'saas_addon_price',
      price.id,
      price,
    );
    return price;
  }

  async configureCoupon(
    principal: Principal,
    dto: ConfigureCouponDto,
  ) {
    this.assertPlatformAdmin(principal);
    const value = Number(dto.discountValue);
    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      (dto.discountType === 'PERCENT' && value > 100)
    ) {
      throw new BadRequestException('Coupon discount value is invalid.');
    }
    if (dto.discountType === 'FIXED' && !dto.currency) {
      throw new BadRequestException(
        'Fixed-value coupons require a currency.',
      );
    }

    const startsAt = this.optionalDate(dto.startsAt, 'coupon startsAt');
    const expiresAt = this.optionalDate(dto.expiresAt, 'coupon expiresAt');
    if (startsAt && expiresAt && startsAt >= expiresAt) {
      throw new BadRequestException(
        'Coupon expiry must be after its start time.',
      );
    }

    const [coupon] = await this.database.db
      .insert(saasCoupons)
      .values({
        code: dto.code.toUpperCase(),
        name: dto.name.trim(),
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        currency: dto.currency,
        duration: dto.duration ?? 'ONCE',
        maxRedemptions: dto.maxRedemptions,
        startsAt,
        expiresAt,
        isActive: dto.isActive ?? false,
        metadata: dto.metadata,
      })
      .onConflictDoUpdate({
        target: saasCoupons.code,
        set: {
          name: dto.name.trim(),
          discountType: dto.discountType,
          discountValue: dto.discountValue,
          currency: dto.currency,
          duration: dto.duration ?? 'ONCE',
          maxRedemptions: dto.maxRedemptions,
          startsAt,
          expiresAt,
          isActive: dto.isActive ?? false,
          metadata: dto.metadata,
          updatedAt: new Date(),
        },
      })
      .returning();

    await this.audit(
      principal,
      'saas.coupon.configure',
      'saas_coupon',
      coupon.id,
      coupon,
    );
    return coupon;
  }

  async metrics(principal: Principal) {
    this.assertPlatformAdmin(principal);
    const [
      subscriptionRows,
      planPriceRows,
      addonRows,
      addonPriceRows,
      invoiceRows,
      dunningRows,
      events,
    ] = await Promise.all([
      this.database.db.select().from(subscriptions),
      this.database.db
        .select()
        .from(saasPlanPrices)
        .where(eq(saasPlanPrices.status, 'ACTIVE')),
      this.database.db
        .select()
        .from(saasSubscriptionAddons)
        .where(eq(saasSubscriptionAddons.status, 'ACTIVE')),
      this.database.db
        .select()
        .from(saasAddonPrices)
        .where(eq(saasAddonPrices.status, 'ACTIVE')),
      this.database.db.select().from(saasInvoices),
      this.database.db
        .select()
        .from(saasDunningCases)
        .where(eq(saasDunningCases.status, 'OPEN')),
      this.database.db
        .select()
        .from(saasSubscriptionEvents)
        .orderBy(desc(saasSubscriptionEvents.createdAt))
        .limit(10000),
    ]);

    const activeSubscriptions = subscriptionRows.filter((subscription) =>
      ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(subscription.status),
    );
    let mrr = 0;
    for (const subscription of activeSubscriptions) {
      if (subscription.status === 'TRIALING') continue;
      const price = planPriceRows.find(
        (item) =>
          item.planId === subscription.planId &&
          item.billingCycle === subscription.billingCycle,
      );
      if (price) {
        mrr +=
          subscription.billingCycle === 'YEARLY'
            ? Number(price.amount) / 12
            : Number(price.amount);
      }

      for (const item of addonRows.filter(
        (addon) => addon.subscriptionId === subscription.id,
      )) {
        const addonPrice = addonPriceRows.find(
          (candidate) =>
            candidate.addonId === item.addonId &&
            candidate.billingCycle === subscription.billingCycle,
        );
        if (!addonPrice) continue;
        const monthly =
          subscription.billingCycle === 'YEARLY'
            ? Number(addonPrice.amount) / 12
            : Number(addonPrice.amount);
        mrr += monthly * item.quantity;
      }
    }

    const now = Date.now();
    const last30Days = new Date(now - 30 * 86_400_000);
    const trialStarts = events.filter(
      (event) =>
        event.eventType === 'TRIAL_STARTED' &&
        event.createdAt >= last30Days,
    );
    const conversions = events.filter(
      (event) =>
        event.eventType === 'TRIAL_CONVERTED' &&
        event.createdAt >= last30Days,
    );
    const churn = events.filter(
      (event) =>
        event.eventType === 'SUBSCRIPTION_CANCELLED' &&
        event.createdAt >= last30Days,
    );

    return {
      activeSubscriptions: activeSubscriptions.length,
      trialing: subscriptionRows.filter(
        (subscription) => subscription.status === 'TRIALING',
      ).length,
      pastDue: subscriptionRows.filter(
        (subscription) => subscription.status === 'PAST_DUE',
      ).length,
      mrr: this.money(mrr),
      arr: this.money(mrr * 12),
      trialConversion30d: {
        starts: trialStarts.length,
        conversions: conversions.length,
        rate:
          trialStarts.length > 0
            ? Number(
                (
                  (conversions.length / trialStarts.length) *
                  100
                ).toFixed(2),
              )
            : null,
      },
      churnEvents30d: churn.length,
      failedPaymentsOpen: dunningRows.length,
      outstandingInvoices: invoiceRows.filter((invoice) =>
        ['OPEN', 'PAST_DUE'].includes(invoice.status),
      ).length,
      outstandingAmount: this.money(
        invoiceRows
          .filter((invoice) =>
            ['OPEN', 'PAST_DUE'].includes(invoice.status),
          )
          .reduce(
            (sum, invoice) => sum + Number(invoice.balanceDue),
            0,
          ),
      ),
    };
  }

  private assertPlatformAdmin(principal: Principal) {
    if (!principal.isPlatformAdmin) {
      throw new NotFoundException('Provider resource not found.');
    }
  }

  private async assertPlan(planId: string) {
    const rows = await this.database.db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Plan not found.');
  }

  private async assertAddon(addonId: string) {
    const rows = await this.database.db
      .select({ id: saasAddons.id })
      .from(saasAddons)
      .where(eq(saasAddons.id, addonId))
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Add-on not found.');
  }

  private assertRate(value?: string) {
    if (value === undefined) return;
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw new BadRequestException(
        'Tax rate must be between 0 and 100.',
      );
    }
  }

  private optionalDate(value: string | undefined, label: string) {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${label} is invalid.`);
    }
    return date;
  }

  private money(value: number) {
    return Number(value.toFixed(2));
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
