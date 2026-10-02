import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { planFeatures, plans } from '../database/schema.js';

const STARTER_FEATURES = [
  { key: 'core.crm', enabled: true, limitValue: null },
  { key: 'core.api', enabled: false, limitValue: null },
  { key: 'users.max', enabled: true, limitValue: 5 },
  { key: 'staff.records.max', enabled: true, limitValue: null },
  { key: 'seats.full.max', enabled: true, limitValue: 5 },
  { key: 'seats.light.max', enabled: true, limitValue: 0 },
  { key: 'seats.attendance.max', enabled: true, limitValue: null },
  { key: 'seats.guest.max', enabled: true, limitValue: null },
  { key: 'ai.enabled', enabled: false, limitValue: null },
  { key: 'automation.enabled', enabled: false, limitValue: null },
  { key: 'extension.realestate', enabled: false, limitValue: null },
  { key: 'extension.attendance', enabled: false, limitValue: null },
  { key: 'marketplace.enabled', enabled: false, limitValue: null },
  { key: 'enterprise.controls', enabled: false, limitValue: null },
] as const;

@Injectable()
export class PlansBootstrapService implements OnApplicationBootstrap {
  constructor(private readonly database: DatabaseService) {}

  async onApplicationBootstrap() {
    const existingPlans = await this.database.db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.key, 'starter'))
      .limit(1);

    let planId = existingPlans[0]?.id;
    if (!planId) {
      const [created] = await this.database.db
        .insert(plans)
        .values({ key: 'starter', name: 'Starter', isActive: true })
        .returning({ id: plans.id });
      planId = created.id;
    } else {
      await this.database.db
        .update(plans)
        .set({ name: 'Starter', isActive: true, updatedAt: new Date() })
        .where(eq(plans.id, planId));
    }

    for (const feature of STARTER_FEATURES) {
      const existing = await this.database.db
        .select({ id: planFeatures.id })
        .from(planFeatures)
        .where(
          and(
            eq(planFeatures.planId, planId),
            eq(planFeatures.featureKey, feature.key),
          ),
        )
        .limit(1);

      if (existing.length) {
        await this.database.db.update(planFeatures).set({
          enabled: feature.enabled,
          limitValue: feature.limitValue,
        }).where(eq(planFeatures.id, existing[0].id));
      } else {
        await this.database.db.insert(planFeatures).values({
          planId,
          featureKey: feature.key,
          enabled: feature.enabled,
          limitValue: feature.limitValue,
        });
      }
    }
  }
}
