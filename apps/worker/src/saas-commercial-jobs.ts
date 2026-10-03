import type { Pool, PoolClient } from 'pg';

type SubscriptionRow = {
  id: string;
  organization_id: string;
  plan_id: string;
  status: string;
  billing_cycle: string;
  currency: string;
  current_period_start: Date | null;
  current_period_end: Date | null;
  trial_ends_at: Date | null;
  cancel_at_period_end: boolean;
  pending_plan_id: string | null;
  pending_billing_cycle: string | null;
  pending_change_at: Date | null;
};

type PriceRow = {
  id: string;
  plan_id: string;
  billing_cycle: string;
  currency: string;
  amount: string;
  tax_rate_percent: string;
};

export async function runSaasCommercialMaintenance(pool: Pool) {
  await expireTrials(pool);
  await processEndedSubscriptions(pool);
  await processDunning(pool);
}

async function expireTrials(pool: Pool) {
  const rows = await pool.query<SubscriptionRow>(
    `select *
     from subscriptions
     where status = 'TRIALING'
       and coalesce(trial_ends_at, current_period_end) is not null
       and coalesce(trial_ends_at, current_period_end) <= now()
     limit 100`,
  );

  for (const subscription of rows.rows) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const updated = await client.query(
        `update subscriptions
         set status = 'TRIAL_EXPIRED',
             grace_ends_at = null,
             updated_at = now(),
             version = version + 1
         where id = $1 and status = 'TRIALING'
         returning id`,
        [subscription.id],
      );
      if (!updated.rowCount) {
        await client.query('rollback');
        continue;
      }
      await client.query(
        `update entitlements
         set enabled = false, updated_at = now()
         where organization_id = $1
           and source in ('PLAN', 'COMMERCIAL')`,
        [subscription.organization_id],
      );
      await insertSubscriptionEvent(
        client,
        subscription,
        'TRIAL_EXPIRED',
        {},
      );
      await insertOutbox(
        client,
        subscription.organization_id,
        'saas.subscription.trial_expired.v1',
        'subscription',
        subscription.id,
        { subscriptionId: subscription.id },
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function processEndedSubscriptions(pool: Pool) {
  const rows = await pool.query<SubscriptionRow>(
    `select *
     from subscriptions
     where status in ('ACTIVE', 'PAST_DUE')
       and current_period_end is not null
       and current_period_end <= now()
     order by current_period_end
     limit 100`,
  );

  for (const subscription of rows.rows) {
    if (subscription.cancel_at_period_end) {
      await cancelAtPeriodEnd(pool, subscription);
      continue;
    }

    const existing = await pool.query<{ id: string }>(
      `select id
       from saas_invoices
       where subscription_id = $1
         and status in ('OPEN', 'PAST_DUE')
         and metadata->>'renewalPeriodEnd' = $2
       limit 1`,
      [
        subscription.id,
        subscription.current_period_end?.toISOString(),
      ],
    );
    if (existing.rows[0]) continue;

    await createRenewalInvoice(pool, subscription);
  }
}

async function cancelAtPeriodEnd(
  pool: Pool,
  subscription: SubscriptionRow,
) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const updated = await client.query(
      `update subscriptions
       set status = 'CANCELLED',
           cancel_at_period_end = false,
           cancelled_at = now(),
           pending_plan_id = null,
           pending_billing_cycle = null,
           pending_change_at = null,
           grace_ends_at = null,
           updated_at = now(),
           version = version + 1
       where id = $1 and cancel_at_period_end = true
       returning id`,
      [subscription.id],
    );
    if (!updated.rowCount) {
      await client.query('rollback');
      return;
    }
    await client.query(
      `update saas_subscription_addons
       set status = 'CANCELLED',
           cancelled_at = now(),
           cancel_at_period_end = false,
           pending_quantity = null,
           pending_change_at = null,
           updated_at = now()
       where subscription_id = $1 and status = 'ACTIVE'`,
      [subscription.id],
    );
    await client.query(
      `update entitlements
       set enabled = false, updated_at = now()
       where organization_id = $1
         and source in ('PLAN', 'COMMERCIAL')`,
      [subscription.organization_id],
    );
    await insertSubscriptionEvent(
      client,
      subscription,
      'SUBSCRIPTION_CANCELLED',
      { reason: 'PERIOD_END' },
    );
    await insertOutbox(
      client,
      subscription.organization_id,
      'saas.subscription.cancelled.v1',
      'subscription',
      subscription.id,
      { subscriptionId: subscription.id, reason: 'PERIOD_END' },
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function createRenewalInvoice(
  pool: Pool,
  subscription: SubscriptionRow,
) {
  const targetPlanId =
    subscription.pending_plan_id ?? subscription.plan_id;
  const targetCycle =
    subscription.pending_billing_cycle ?? subscription.billing_cycle;

  const priceRows = await pool.query<PriceRow>(
    `select *
     from saas_plan_prices
     where plan_id = $1
       and billing_cycle = $2
       and currency = $3
       and status = 'ACTIVE'
     limit 1`,
    [targetPlanId, targetCycle, subscription.currency],
  );
  const planPrice = priceRows.rows[0];
  if (!planPrice) {
    await emitActionRequired(
      pool,
      subscription,
      'Active renewal plan price is missing.',
    );
    return;
  }

  const addonRows = await pool.query<{
    subscription_addon_id: string;
    addon_id: string;
    name: string;
    quantity: number;
    pending_quantity: number | null;
    pending_change_at: Date | null;
    amount: string | null;
    tax_rate_percent: string | null;
    price_id: string | null;
  }>(
    `select
       sa.id as subscription_addon_id,
       sa.addon_id,
       addon.name,
       sa.quantity,
       sa.pending_quantity,
       sa.pending_change_at,
       price.amount,
       price.tax_rate_percent,
       price.id as price_id
     from saas_subscription_addons sa
     join saas_addons addon on addon.id = sa.addon_id
     left join saas_addon_prices price
       on price.addon_id = sa.addon_id
      and price.billing_cycle = $2
      and price.currency = $3
      and price.status = 'ACTIVE'
     where sa.subscription_id = $1
       and sa.status = 'ACTIVE'`,
    [subscription.id, targetCycle, subscription.currency],
  );

  const lines: Array<{
    type: string;
    referenceId?: string;
    description: string;
    quantity: number;
    unitAmount: number;
    lineTotal: number;
    tax: number;
  }> = [];

  const planAmount = Number(planPrice.amount);
  const planTax =
    (planAmount * Number(planPrice.tax_rate_percent)) / 100;
  lines.push({
    type: 'PLAN',
    referenceId: planPrice.id,
    description: `Plan renewal · ${targetCycle}`,
    quantity: 1,
    unitAmount: planAmount,
    lineTotal: planAmount,
    tax: planTax,
  });

  for (const addon of addonRows.rows) {
    const pendingDue =
      addon.pending_change_at &&
      addon.pending_change_at.getTime() <= Date.now();
    const quantity = pendingDue
      ? addon.pending_quantity ?? addon.quantity
      : addon.quantity;
    if (quantity <= 0) continue;
    if (!addon.price_id || addon.amount === null) {
      await emitActionRequired(
        pool,
        subscription,
        `Active price is missing for add-on ${addon.name}.`,
      );
      return;
    }
    const amount = Number(addon.amount);
    const lineTotal = amount * quantity;
    lines.push({
      type: 'ADDON',
      referenceId: addon.price_id,
      description: addon.name,
      quantity,
      unitAmount: amount,
      lineTotal,
      tax:
        (lineTotal * Number(addon.tax_rate_percent ?? 0)) / 100,
    });
  }

  const usage = await overageLines(pool, subscription);
  lines.push(...usage);

  const subtotal = money(
    lines.reduce((sum, line) => sum + line.lineTotal, 0),
  );
  const tax = money(
    lines.reduce((sum, line) => sum + line.tax, 0),
  );
  const total = money(subtotal + tax);
  const dueAt = new Date(Date.now() + 3 * 86_400_000);
  const graceEndsAt = new Date(Date.now() + 7 * 86_400_000);
  const invoiceNumber = renewalInvoiceNumber(
    subscription.id,
    subscription.current_period_end ?? new Date(),
  );

  const client = await pool.connect();
  try {
    await client.query('begin');
    const invoice = await client.query<{ id: string }>(
      `insert into saas_invoices (
         organization_id, subscription_id, invoice_number, status,
         currency, subtotal, discount_amount, tax_amount, total,
         paid_amount, balance_due, period_start, period_end, due_at,
         metadata
       ) values (
         $1,$2,$3,'OPEN',$4,$5,0,$6,$7,0,$7,$8,$9,$10,$11::jsonb
       )
       returning id`,
      [
        subscription.organization_id,
        subscription.id,
        invoiceNumber,
        subscription.currency,
        subtotal,
        tax,
        total,
        subscription.current_period_start,
        subscription.current_period_end,
        dueAt,
        JSON.stringify({
          renewal: true,
          renewalPeriodEnd:
            subscription.current_period_end?.toISOString(),
          targetPlanId,
          targetBillingCycle: targetCycle,
        }),
      ],
    );
    for (const line of lines) {
      await client.query(
        `insert into saas_invoice_lines (
           invoice_id, line_type, reference_id, description,
           quantity, unit_amount, line_total, metadata
         ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [
          invoice.rows[0].id,
          line.type,
          line.referenceId ?? null,
          line.description,
          line.quantity,
          line.unitAmount,
          line.lineTotal,
          JSON.stringify({ taxAmount: money(line.tax) }),
        ],
      );
    }
    await client.query(
      `update subscriptions
       set status = 'PAST_DUE',
           grace_ends_at = $2,
           updated_at = now(),
           version = version + 1
       where id = $1`,
      [subscription.id, graceEndsAt],
    );
    await client.query(
      `insert into saas_dunning_cases (
         organization_id, subscription_id, invoice_id, status,
         attempt_count, next_attempt_at, grace_ends_at
       ) values ($1,$2,$3,'OPEN',0,now(),$4)
       on conflict (invoice_id) do nothing`,
      [
        subscription.organization_id,
        subscription.id,
        invoice.rows[0].id,
        graceEndsAt,
      ],
    );
    await insertSubscriptionEvent(
      client,
      subscription,
      'RENEWAL_INVOICE_CREATED',
      {
        invoiceId: invoice.rows[0].id,
        total,
        currency: subscription.currency,
        targetPlanId,
        targetBillingCycle: targetCycle,
      },
    );
    await insertOutbox(
      client,
      subscription.organization_id,
      'saas.invoice.payment_required.v1',
      'saas_invoice',
      invoice.rows[0].id,
      {
        invoiceId: invoice.rows[0].id,
        subscriptionId: subscription.id,
        total,
        currency: subscription.currency,
        dueAt: dueAt.toISOString(),
        paymentProviderRequired: true,
      },
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function overageLines(
  pool: Pool,
  subscription: SubscriptionRow,
) {
  if (!subscription.current_period_end) return [];
  const from =
    subscription.current_period_start ??
    new Date(subscription.current_period_end.getTime() - 31 * 86_400_000);
  const rows = await pool.query<{
    meter_key: string;
    unit: string;
    included_quantity: string;
    unit_amount: string;
    used_quantity: string;
  }>(
    `select
       meter.meter_key,
       meter.unit,
       meter.included_quantity,
       meter.unit_amount,
       coalesce(sum(usage.quantity), 0)::text as used_quantity
     from saas_meter_prices meter
     left join saas_usage_ledger usage
       on usage.organization_id = $1
      and usage.meter_key = meter.meter_key
      and usage.occurred_at >= $4
      and usage.occurred_at < $5
     where meter.plan_id = $2
       and meter.currency = $3
       and meter.is_active = true
       and meter.enforcement_mode = 'OVERAGE'
     group by meter.id`,
    [
      subscription.organization_id,
      subscription.plan_id,
      subscription.currency,
      from,
      subscription.current_period_end,
    ],
  );
  return rows.rows
    .map((row) => {
      const overage = Math.max(
        0,
        Number(row.used_quantity) -
          Number(row.included_quantity),
      );
      return {
        type: 'USAGE',
        description: `${row.meter_key} overage`,
        quantity: overage,
        unitAmount: Number(row.unit_amount),
        lineTotal: money(overage * Number(row.unit_amount)),
        tax: 0,
      };
    })
    .filter((line) => line.quantity > 0);
}

async function processDunning(pool: Pool) {
  const rows = await pool.query<{
    id: string;
    organization_id: string;
    subscription_id: string;
    invoice_id: string;
    attempt_count: number;
    next_attempt_at: Date | null;
    grace_ends_at: Date | null;
  }>(
    `select *
     from saas_dunning_cases
     where status = 'OPEN'
       and (next_attempt_at is null or next_attempt_at <= now())
     order by created_at
     limit 100`,
  );

  for (const item of rows.rows) {
    if (
      item.grace_ends_at &&
      item.grace_ends_at.getTime() <= Date.now()
    ) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(
          `update subscriptions
           set status = 'RESTRICTED', updated_at = now(),
               version = version + 1
           where id = $1 and status = 'PAST_DUE'`,
          [item.subscription_id],
        );
        await client.query(
          `update entitlements
           set enabled = false, updated_at = now()
           where organization_id = $1
             and source in ('PLAN', 'COMMERCIAL')`,
          [item.organization_id],
        );
        await client.query(
          `update saas_dunning_cases
           set status = 'RESTRICTED', closed_at = now(),
               updated_at = now()
           where id = $1`,
          [item.id],
        );
        await insertOutbox(
          client,
          item.organization_id,
          'saas.subscription.restricted.v1',
          'subscription',
          item.subscription_id,
          {
            subscriptionId: item.subscription_id,
            invoiceId: item.invoice_id,
          },
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
      continue;
    }

    const attempt = item.attempt_count + 1;
    const next = new Date(
      Date.now() + Math.min(attempt, 3) * 86_400_000,
    );
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into saas_dunning_attempts (
           dunning_case_id, attempt_number, status, error
         ) values ($1,$2,'PENDING_PROVIDER',
                   'Payment-provider adapter is not activated.')
         on conflict (dunning_case_id, attempt_number) do nothing`,
        [item.id, attempt],
      );
      await client.query(
        `update saas_dunning_cases
         set attempt_count = greatest(attempt_count, $2),
             next_attempt_at = $3,
             last_error = 'Payment-provider adapter is not activated.',
             updated_at = now()
         where id = $1`,
        [item.id, attempt, next],
      );
      await insertOutbox(
        client,
        item.organization_id,
        'saas.payment.collection_required.v1',
        'saas_invoice',
        item.invoice_id,
        {
          invoiceId: item.invoice_id,
          subscriptionId: item.subscription_id,
          dunningCaseId: item.id,
          attempt,
          paymentProviderRequired: true,
        },
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function emitActionRequired(
  pool: Pool,
  subscription: SubscriptionRow,
  reason: string,
) {
  await pool.query(
    `insert into outbox_events (
       organization_id, event_type, aggregate_type, aggregate_id, payload
     ) values ($1,'saas.subscription.action_required.v1',
               'subscription',$2,$3::jsonb)`,
    [
      subscription.organization_id,
      subscription.id,
      JSON.stringify({
        subscriptionId: subscription.id,
        reason,
      }),
    ],
  );
}

async function insertSubscriptionEvent(
  client: PoolClient,
  subscription: Pick<
    SubscriptionRow,
    'id' | 'organization_id'
  >,
  eventType: string,
  payload: Record<string, unknown>,
) {
  await client.query(
    `insert into saas_subscription_events (
       organization_id, subscription_id, event_type, payload
     ) values ($1,$2,$3,$4::jsonb)`,
    [
      subscription.organization_id,
      subscription.id,
      eventType,
      JSON.stringify(payload),
    ],
  );
}

async function insertOutbox(
  client: PoolClient,
  organizationId: string,
  eventType: string,
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown>,
) {
  await client.query(
    `insert into outbox_events (
       organization_id, event_type, aggregate_type, aggregate_id, payload
     ) values ($1,$2,$3,$4,$5::jsonb)`,
    [
      organizationId,
      eventType,
      aggregateType,
      aggregateId,
      JSON.stringify(payload),
    ],
  );
}

function renewalInvoiceNumber(
  subscriptionId: string,
  periodEnd: Date,
) {
  const stamp = periodEnd
    .toISOString()
    .slice(0, 10)
    .replaceAll('-', '');
  return `SAAS-REN-${stamp}-${subscriptionId
    .slice(0, 8)
    .toUpperCase()}`;
}

function money(value: number) {
  return Number(value.toFixed(2));
}
