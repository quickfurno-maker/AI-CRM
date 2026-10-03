import type { Pool } from 'pg';

type PendingCollection = {
  attempt_id: string;
  attempt_number: number;
  dunning_case_id: string;
  organization_id: string;
  invoice_id: string;
  balance_due: string;
  currency: string;
};

type ProviderOrder = {
  id: string;
  status: string;
  amount: number;
  currency: string;
};

const paymentMode =
  process.env.SAAS_PAYMENT_MODE ?? 'disabled';
const paymentProvider =
  process.env.SAAS_PAYMENT_PROVIDER ??
  (paymentMode === 'test' ? 'test' : 'razorpay');

export async function runPaymentGatewayCollections(pool: Pool) {
  if (paymentMode === 'disabled') return;

  const rows = await pool.query<PendingCollection>(`
    select
      attempt.id as attempt_id,
      attempt.attempt_number,
      dunning.id as dunning_case_id,
      dunning.organization_id,
      dunning.invoice_id,
      invoice.balance_due,
      invoice.currency
    from saas_dunning_attempts attempt
    join saas_dunning_cases dunning
      on dunning.id = attempt.dunning_case_id
    join saas_invoices invoice
      on invoice.id = dunning.invoice_id
    where attempt.status = 'PENDING_PROVIDER'
      and attempt.provider_attempt_id is null
      and dunning.status = 'OPEN'
      and invoice.status in ('OPEN', 'PAST_DUE')
      and invoice.balance_due > 0
    order by attempt.created_at
    limit 25
  `);

  for (const row of rows.rows) {
    await createCollectionIntent(pool, row);
  }
}

async function createCollectionIntent(
  pool: Pool,
  row: PendingCollection,
) {
  const idempotencyKey =
    'dunning:' +
    row.dunning_case_id +
    ':' +
    row.attempt_number;

  const existing = await pool.query<{
    id: string;
    provider_order_id: string | null;
    status: string;
  }>(
    `select id, provider_order_id, status
     from saas_payment_intents
     where provider = $1 and idempotency_key = $2
     limit 1`,
    [paymentProvider, idempotencyKey],
  );
  if (existing.rows[0]?.provider_order_id) {
    await markAttemptReady(
      pool,
      row,
      existing.rows[0].id,
      existing.rows[0].provider_order_id,
    );
    return;
  }

  const client = await pool.connect();
  let intentId = existing.rows[0]?.id;
  try {
    await client.query('begin');
    if (!intentId) {
      const inserted = await client.query<{ id: string }>(
        `insert into saas_payment_intents (
           organization_id, invoice_id, dunning_case_id,
           provider, purpose, amount, currency, status,
           idempotency_key, metadata
         ) values ($1,$2,$3,$4,'DUNNING',$5,$6,'CREATING',$7,$8::jsonb)
         on conflict (provider, idempotency_key) do nothing
         returning id`,
        [
          row.organization_id,
          row.invoice_id,
          row.dunning_case_id,
          paymentProvider,
          row.balance_due,
          row.currency,
          idempotencyKey,
          JSON.stringify({
            attemptNumber: row.attempt_number,
            source: 'commercial_worker',
          }),
        ],
      );
      intentId = inserted.rows[0]?.id;
      if (!intentId) {
        const raced = await client.query<{ id: string }>(
          `select id from saas_payment_intents
           where provider = $1 and idempotency_key = $2`,
          [paymentProvider, idempotencyKey],
        );
        intentId = raced.rows[0]?.id;
      }
    }
    if (!intentId) throw new Error('Unable to create dunning payment intent.');
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  try {
    const order = await createProviderOrder({
      intentId,
      amountMinor: toMinor(Number(row.balance_due)),
      currency: row.currency,
      receipt: 'bos_' + intentId,
      notes: {
        payment_intent_id: intentId,
        organization_id: row.organization_id,
        invoice_id: row.invoice_id,
        dunning_case_id: row.dunning_case_id,
      },
    });

    await pool.query(
      `update saas_payment_intents
       set status = 'PENDING',
           provider_order_id = $2,
           metadata = coalesce(metadata, '{}'::jsonb) ||
             jsonb_build_object('providerOrder', $3::jsonb),
           updated_at = now()
       where id = $1`,
      [intentId, order.id, JSON.stringify(order)],
    );
    await markAttemptReady(pool, row, intentId, order.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    await pool.query(
      `update saas_payment_intents
       set status = 'FAILED',
           failure_reason = left($2, 4000),
           updated_at = now()
       where id = $1`,
      [intentId, message],
    );
    await pool.query(
      `update saas_dunning_attempts
       set status = 'PROVIDER_FAILED',
           error = left($2, 4000)
       where id = $1`,
      [row.attempt_id, message],
    );
  }
}

async function markAttemptReady(
  pool: Pool,
  row: PendingCollection,
  intentId: string,
  providerOrderId: string,
) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `update saas_dunning_attempts
       set status = 'ACTION_REQUIRED',
           provider_attempt_id = $2,
           error = null
       where id = $1`,
      [row.attempt_id, providerOrderId],
    );
    await client.query(
      `update saas_dunning_cases
       set last_error = null, updated_at = now()
       where id = $1`,
      [row.dunning_case_id],
    );
    await client.query(
      `insert into outbox_events (
         organization_id, event_type, aggregate_type,
         aggregate_id, payload
       ) values ($1,'saas.payment.customer_action_required.v1',
                 'saas_payment_intent',$2,$3::jsonb)`,
      [
        row.organization_id,
        intentId,
        JSON.stringify({
          paymentIntentId: intentId,
          invoiceId: row.invoice_id,
          dunningCaseId: row.dunning_case_id,
          provider: paymentProvider,
          providerOrderId,
          amount: row.balance_due,
          currency: row.currency,
        }),
      ],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function createProviderOrder(input: {
  intentId: string;
  amountMinor: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}): Promise<ProviderOrder> {
  if (paymentProvider === 'test') {
    return {
      id: 'test_order_' + input.intentId.replaceAll('-', ''),
      status: 'created',
      amount: input.amountMinor,
      currency: input.currency,
    };
  }

  if (paymentProvider !== 'razorpay') {
    throw new Error(
      'Unsupported SaaS payment provider: ' + paymentProvider,
    );
  }
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error(
      'Razorpay credentials are missing for payment collection.',
    );
  }

  const auth = Buffer.from(keyId + ':' + keySecret).toString(
    'base64',
  );
  const response = await fetch(
    'https://api.razorpay.com/v1/orders',
    {
      method: 'POST',
      headers: {
        authorization: 'Basic ' + auth,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amount: input.amountMinor,
        currency: input.currency,
        receipt: input.receipt.slice(0, 40),
        notes: input.notes,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error(
      'Razorpay order creation failed (' +
        response.status +
        '): ' +
        (await response.text()).slice(0, 1000),
    );
  }
  return (await response.json()) as ProviderOrder;
}

function toMinor(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid invoice balance for collection.');
  }
  return Math.round(amount * 100);
}
