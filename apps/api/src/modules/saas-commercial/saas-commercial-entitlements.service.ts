import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  entitlements,
  planFeatures,
  subscriptions,
} from '../../platform/database/schema.js';
import {
  saasAddons,
  saasSubscriptionAddons,
} from './saas-commercial.schema.js';

type DbTx =
  Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];

type EffectiveEntitlement = {
  enabled: boolean;
  limitValue: number | null;
};

@Injectable()
export class SaasCommercialEntitlementsService {
  constructor(private readonly database: DatabaseService) {}

  async reconcile(organizationId: string, subscriptionId: string) {
    return this.database.db.transaction((tx) =>
      this.reconcileWithTx(tx, organizationId, subscriptionId),
    );
  }

  async reconcileWithTx(
    tx: DbTx,
    organizationId: string,
    subscriptionId: string,
  ) {
    const subscriptionRows = await tx
      .select({
        id: subscriptions.id,
        planId: subscriptions.planId,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.organizationId, organizationId),
          eq(subscriptions.id, subscriptionId),
        ),
      )
      .limit(1);
    const subscription = subscriptionRows[0];
    if (!subscription) {
      throw new NotFoundException('Subscription not found.');
    }

    const [features, addonRows, existing] = await Promise.all([
      tx
        .select({
          key: planFeatures.featureKey,
          enabled: planFeatures.enabled,
          limitValue: planFeatures.limitValue,
        })
        .from(planFeatures)
        .where(eq(planFeatures.planId, subscription.planId)),
      tx
        .select({
          entitlementKey: saasAddons.entitlementKey,
          entitlementMode: saasAddons.entitlementMode,
          unitsPerQuantity: saasAddons.unitsPerQuantity,
          quantity: saasSubscriptionAddons.quantity,
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
            eq(saasSubscriptionAddons.status, 'ACTIVE'),
            eq(saasAddons.isActive, true),
          ),
        ),
      tx
        .select({
          key: entitlements.key,
          source: entitlements.source,
          enabled: entitlements.enabled,
          limitValue: entitlements.limitValue,
        })
        .from(entitlements)
        .where(eq(entitlements.organizationId, organizationId)),
    ]);

    const effective = new Map<string, EffectiveEntitlement>();
    for (const feature of features) {
      effective.set(feature.key, {
        enabled: feature.enabled,
        limitValue: feature.limitValue,
      });
    }

    for (const addon of addonRows) {
      const current = effective.get(addon.entitlementKey) ?? {
        enabled: false,
        limitValue: 0,
      };
      if (addon.entitlementMode === 'ENABLE') {
        effective.set(addon.entitlementKey, {
          enabled: true,
          limitValue: current.limitValue,
        });
        continue;
      }

      const increment =
        addon.unitsPerQuantity * Math.max(0, addon.quantity);
      effective.set(addon.entitlementKey, {
        enabled: true,
        limitValue:
          current.limitValue === null
            ? null
            : Math.max(0, current.limitValue ?? 0) + increment,
      });
    }

    const providerOverrides = new Set(
      existing
        .filter((row) => row.source === 'ADDON' || row.source === 'SYSTEM')
        .map((row) => row.key),
    );
    const managedKeys = new Set([
      ...features.map((feature) => feature.key),
      ...addonRows.map((addon) => addon.entitlementKey),
      ...existing
        .filter(
          (row) =>
            row.source === 'PLAN' || row.source === 'COMMERCIAL',
        )
        .map((row) => row.key),
    ]);

    for (const key of managedKeys) {
      if (providerOverrides.has(key)) continue;
      const value = effective.get(key) ?? {
        enabled: false,
        limitValue: 0,
      };
      await tx
        .insert(entitlements)
        .values({
          organizationId,
          key,
          enabled: value.enabled,
          limitValue: value.limitValue,
          source: 'COMMERCIAL',
        })
        .onConflictDoUpdate({
          target: [entitlements.organizationId, entitlements.key],
          set: {
            enabled: value.enabled,
            limitValue: value.limitValue,
            source: 'COMMERCIAL',
            updatedAt: new Date(),
          },
        });
    }

    const keys = [...managedKeys].filter(
      (key) => !providerOverrides.has(key),
    );
    return keys.length
      ? tx
          .select({
            key: entitlements.key,
            enabled: entitlements.enabled,
            limitValue: entitlements.limitValue,
            source: entitlements.source,
          })
          .from(entitlements)
          .where(
            and(
              eq(entitlements.organizationId, organizationId),
              inArray(entitlements.key, keys),
            ),
          )
      : [];
  }
}
