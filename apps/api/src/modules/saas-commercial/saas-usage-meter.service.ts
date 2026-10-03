import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { DatabaseService } from '../../platform/database/database.service.js';
import { subscriptions } from '../../platform/database/schema.js';
import {
  saasMeterPrices,
  saasUsageLedger,
} from './saas-commercial.schema.js';

export type CommercialUsageRecord = {
  organizationId: string;
  meterKey: string;
  quantity: number;
  unit?: string;
  sourceType: string;
  sourceId?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
  enforce?: boolean;
};

@Injectable()
export class SaasUsageMeterService {
  constructor(private readonly database: DatabaseService) {}

  async assertCanConsume(
    organizationId: string,
    meterKey: string,
    quantity = 1,
  ) {
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new ConflictException('Usage quantity must be non-negative.');
    }
    const context = await this.meterContext(organizationId, meterKey);
    if (!context.policy) {
      return {
        metered: false,
        allowed: true,
        used: 0,
        projected: quantity,
        included: null,
        enforcementMode: 'UNMETERED',
      };
    }

    const used = await this.usedQuantity(
      organizationId,
      meterKey,
      context.periodStart,
      context.periodEnd,
    );
    const included = Number(context.policy.includedQuantity);
    const projected = used + quantity;
    const exceeded = projected > included;

    if (
      exceeded &&
      context.policy.enforcementMode === 'HARD_LIMIT'
    ) {
      throw new ConflictException(
        `${meterKey} usage limit has been reached for this billing period.`,
      );
    }
    if (
      exceeded &&
      context.policy.enforcementMode === 'THROTTLE'
    ) {
      throw new HttpException(
        `${meterKey} usage is throttled after the included allowance.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return {
      metered: true,
      allowed: true,
      used,
      projected,
      included,
      overage: Math.max(0, projected - included),
      warning:
        included > 0 &&
        projected / included >=
          context.policy.warningThresholdPercent / 100,
      enforcementMode: context.policy.enforcementMode,
      unit: context.policy.unit,
      unitAmount: Number(context.policy.unitAmount),
      currency: context.policy.currency,
      periodStart: context.periodStart,
      periodEnd: context.periodEnd,
    };
  }

  async record(input: CommercialUsageRecord) {
    if (!Number.isFinite(input.quantity) || input.quantity < 0) {
      throw new ConflictException('Usage quantity must be non-negative.');
    }
    if (input.enforce !== false) {
      await this.assertCanConsume(
        input.organizationId,
        input.meterKey,
        input.quantity,
      );
    }

    const inserted = await this.database.db
      .insert(saasUsageLedger)
      .values({
        organizationId: input.organizationId,
        meterKey: input.meterKey,
        quantity: String(input.quantity),
        unit: input.unit ?? 'unit',
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        occurredAt: input.occurredAt ?? new Date(),
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
      })
      .onConflictDoNothing({
        target: [
          saasUsageLedger.organizationId,
          saasUsageLedger.idempotencyKey,
        ],
      })
      .returning();

    if (inserted[0]) return inserted[0];

    const existing = await this.database.db
      .select()
      .from(saasUsageLedger)
      .where(
        and(
          eq(
            saasUsageLedger.organizationId,
            input.organizationId,
          ),
          eq(
            saasUsageLedger.idempotencyKey,
            input.idempotencyKey,
          ),
        ),
      )
      .limit(1);
    return existing[0];
  }

  async summary(organizationId: string) {
    const subscriptionRows = await this.database.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .limit(1);
    const subscription = subscriptionRows[0];
    if (!subscription) {
      throw new ConflictException(
        'Organization does not have a subscription.',
      );
    }

    const periodStart =
      subscription.currentPeriodStart ?? subscription.createdAt;
    const periodEnd =
      subscription.currentPeriodEnd ??
      new Date(Date.now() + 31 * 86_400_000);

    const policies = await this.database.db
      .select()
      .from(saasMeterPrices)
      .where(
        and(
          eq(saasMeterPrices.planId, subscription.planId),
          eq(saasMeterPrices.currency, subscription.currency),
          eq(saasMeterPrices.isActive, true),
        ),
      );

    const grouped = await this.database.db
      .select({
        meterKey: saasUsageLedger.meterKey,
        quantity: sql<string>`coalesce(sum(${saasUsageLedger.quantity}), 0)`,
      })
      .from(saasUsageLedger)
      .where(
        and(
          eq(saasUsageLedger.organizationId, organizationId),
          gte(saasUsageLedger.occurredAt, periodStart),
          lt(saasUsageLedger.occurredAt, periodEnd),
        ),
      )
      .groupBy(saasUsageLedger.meterKey);

    const usage = new Map(
      grouped.map((row) => [
        row.meterKey,
        Number(row.quantity),
      ]),
    );

    return {
      periodStart,
      periodEnd,
      meters: policies.map((policy) => {
        const used = usage.get(policy.meterKey) ?? 0;
        const included = Number(policy.includedQuantity);
        const overage = Math.max(0, used - included);
        return {
          meterKey: policy.meterKey,
          unit: policy.unit,
          used,
          included,
          remaining: Math.max(0, included - used),
          overage,
          unitAmount: Number(policy.unitAmount),
          estimatedOverageAmount: Number(
            (overage * Number(policy.unitAmount)).toFixed(6),
          ),
          currency: policy.currency,
          enforcementMode: policy.enforcementMode,
          warningThresholdPercent:
            policy.warningThresholdPercent,
          warning:
            included > 0 &&
            used / included >=
              policy.warningThresholdPercent / 100,
        };
      }),
      unpricedMeters: grouped
        .filter(
          (row) =>
            !policies.some(
              (policy) => policy.meterKey === row.meterKey,
            ),
        )
        .map((row) => ({
          meterKey: row.meterKey,
          used: Number(row.quantity),
        })),
    };
  }

  private async meterContext(
    organizationId: string,
    meterKey: string,
  ) {
    const subscriptionRows = await this.database.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .limit(1);
    const subscription = subscriptionRows[0];
    if (!subscription) {
      throw new ConflictException(
        'Organization does not have a subscription.',
      );
    }
    if (
      !['TRIALING', 'ACTIVE', 'PAST_DUE'].includes(
        subscription.status,
      )
    ) {
      throw new ConflictException(
        'Subscription is not active for metered usage.',
      );
    }
    if (
      subscription.graceEndsAt &&
      subscription.graceEndsAt.getTime() < Date.now() &&
      subscription.status === 'PAST_DUE'
    ) {
      throw new ConflictException(
        'Subscription payment grace period has expired.',
      );
    }

    const policyRows = await this.database.db
      .select()
      .from(saasMeterPrices)
      .where(
        and(
          eq(saasMeterPrices.planId, subscription.planId),
          eq(saasMeterPrices.meterKey, meterKey),
          eq(saasMeterPrices.currency, subscription.currency),
          eq(saasMeterPrices.isActive, true),
        ),
      )
      .limit(1);

    return {
      subscription,
      policy: policyRows[0],
      periodStart:
        subscription.currentPeriodStart ??
        subscription.createdAt,
      periodEnd:
        subscription.currentPeriodEnd ??
        new Date(Date.now() + 31 * 86_400_000),
    };
  }

  private async usedQuantity(
    organizationId: string,
    meterKey: string,
    from: Date,
    to: Date,
  ) {
    const rows = await this.database.db
      .select({
        quantity: sql<string>`coalesce(sum(${saasUsageLedger.quantity}), 0)`,
      })
      .from(saasUsageLedger)
      .where(
        and(
          eq(saasUsageLedger.organizationId, organizationId),
          eq(saasUsageLedger.meterKey, meterKey),
          gte(saasUsageLedger.occurredAt, from),
          lt(saasUsageLedger.occurredAt, to),
        ),
      );
    return Number(rows[0]?.quantity ?? 0);
  }
}
