import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export type CampaignRecipientJob = {
  recipient_id: string;
  organization_id: string;
  contact_id: string;
  destination: string;
  campaign_id: string;
  workspace_id: string;
  channel_account_id: string;
  template_id: string;
  template_name: string;
  template_language: string;
  template_category: string | null;
  template_components: unknown[];
  provider_phone_number_id: string | null;
  credential_ref: string | null;
  channel_status: string;
};

class ProviderSendError extends Error {
  constructor(
    message: string,
    readonly ambiguous: boolean,
  ) {
    super(message);
  }
}

function transportMode() {
  return process.env.META_TRANSPORT_MODE ?? 'disabled';
}

function resolveCredential(reference: string | null) {
  if (!reference) {
    throw new ProviderSendError(
      'Channel credential reference is not configured.',
      false,
    );
  }
  if (reference.startsWith('mock:')) return reference;
  if (reference.startsWith('env:')) {
    const name = reference.slice(4);
    const value = process.env[name];
    if (!value) {
      throw new ProviderSendError(
        `Credential environment variable ${name} is not configured.`,
        false,
      );
    }
    return value;
  }
  throw new ProviderSendError(
    'Unsupported credential reference.',
    false,
  );
}

function hasUnresolvedVariables(components: unknown[]) {
  return JSON.stringify(components).includes('{{');
}

async function assertCommercialUsage(
  pool: Pool,
  organizationId: string,
  meterKey: string,
  quantity: number,
) {
  const context = await pool.query<{
    status: string;
    period_start: Date;
    period_end: Date;
    included_quantity: string | null;
    enforcement_mode: string | null;
  }>(
    `select
       subscription.status,
       coalesce(subscription.current_period_start, subscription.created_at) as period_start,
       coalesce(subscription.current_period_end, now() + interval '31 days') as period_end,
       meter.included_quantity,
       meter.enforcement_mode
     from subscriptions subscription
     left join saas_meter_prices meter
       on meter.plan_id = subscription.plan_id
      and meter.meter_key = $2
      and meter.currency = subscription.currency
      and meter.is_active = true
     where subscription.organization_id = $1
     limit 1`,
    [organizationId, meterKey],
  );
  const row = context.rows[0];
  if (!row) {
    throw new ProviderSendError('Subscription was not found.', false);
  }
  if (!['TRIALING', 'ACTIVE', 'PAST_DUE'].includes(row.status)) {
    throw new ProviderSendError(
      'Subscription is not active for metered usage.',
      false,
    );
  }
  if (row.included_quantity === null || row.enforcement_mode === null) {
    return;
  }

  const used = await pool.query<{ quantity: string }>(
    `select coalesce(sum(quantity), 0)::text as quantity
     from saas_usage_ledger
     where organization_id = $1
       and meter_key = $2
       and occurred_at >= $3
       and occurred_at < $4`,
    [organizationId, meterKey, row.period_start, row.period_end],
  );
  const projected =
    Number(used.rows[0]?.quantity ?? 0) + quantity;
  if (
    projected > Number(row.included_quantity) &&
    ['HARD_LIMIT', 'THROTTLE'].includes(row.enforcement_mode)
  ) {
    throw new ProviderSendError(
      `${meterKey} allowance has been reached for this billing period.`,
      false,
    );
  }
}

async function hasConsent(pool: Pool, job: CampaignRecipientJob) {
  const purpose =
    job.template_category === 'MARKETING' ? 'MARKETING' : 'SERVICE';
  const result = await pool.query<{ allowed: boolean }>(
    `select exists(
       select 1
       from communication_consents
       where organization_id = $1
         and contact_id = $2
         and channel_type = 'WHATSAPP'
         and purpose = $3
         and status = 'GRANTED'
     ) as allowed`,
    [job.organization_id, job.contact_id, purpose],
  );
  return Boolean(result.rows[0]?.allowed);
}
async function sendTemplate(job: CampaignRecipientJob) {
  if (job.channel_status !== 'CONNECTED') {
    throw new ProviderSendError(
      'WhatsApp channel is not connected.',
      false,
    );
  }
  if (!job.provider_phone_number_id) {
    throw new ProviderSendError(
      'WhatsApp Phone Number ID is missing.',
      false,
    );
  }
  if (hasUnresolvedVariables(job.template_components)) {
    throw new ProviderSendError(
      'Template contains variables but campaign personalization is not configured.',
      false,
    );
  }

  const mode = transportMode();
  if (mode === 'mock') {
    return {
      externalMessageId: 'mock.campaign.' + randomUUID(),
      providerResponse: { mock: true },
    };
  }
  if (mode !== 'live') {
    throw new ProviderSendError(
      'Meta transport is disabled.',
      false,
    );
  }

  const version = process.env.META_GRAPH_VERSION;
  if (!version) {
    throw new ProviderSendError(
      'META_GRAPH_VERSION is not configured.',
      false,
    );
  }
  const token = resolveCredential(job.credential_ref);

  let response: Response;
  try {
    response = await fetch(
      `https://graph.facebook.com/${version}/${job.provider_phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: job.destination,
          type: 'template',
          template: {
            name: job.template_name,
            language: { code: job.template_language },
          },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch (error) {
    throw new ProviderSendError(
      error instanceof Error ? error.message : String(error),
      true,
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (!response.ok) {
    const detail = JSON.stringify(body).slice(0, 1500);
    throw new ProviderSendError(
      `Meta send failed with HTTP ${response.status}: ${detail}`,
      response.status >= 500,
    );
  }

  const providerMessages = Array.isArray(body.messages)
    ? (body.messages as Array<Record<string, unknown>>)
    : [];
  const externalMessageId = providerMessages[0]?.id;
  if (typeof externalMessageId !== 'string' || !externalMessageId) {
    throw new ProviderSendError(
      'Meta response did not include a message ID.',
      true,
    );
  }

  return { externalMessageId, providerResponse: body };
}
async function ensureConversation(
  client: PoolClient,
  job: CampaignRecipientJob,
) {
  const existing = await client.query<{ id: string }>(
    `select id
     from communication_conversations
     where organization_id = $1
       and channel_account_id = $2
       and contact_id = $3
     limit 1`,
    [
      job.organization_id,
      job.channel_account_id,
      job.contact_id,
    ],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const created = await client.query<{ id: string }>(
    `insert into communication_conversations (
       organization_id,
       workspace_id,
       channel_account_id,
       contact_id,
       status,
       handling_mode,
       unread_count
     ) values ($1, $2, $3, $4, 'OPEN', 'HUMAN', 0)
     on conflict (channel_account_id, contact_id)
     do update set updated_at = now()
     returning id`,
    [
      job.organization_id,
      job.workspace_id,
      job.channel_account_id,
      job.contact_id,
    ],
  );
  return created.rows[0].id;
}

async function persistSuccess(
  pool: Pool,
  job: CampaignRecipientJob,
  result: {
    externalMessageId: string;
    providerResponse: Record<string, unknown>;
  },
) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const conversationId = await ensureConversation(client, job);
    const message = await client.query<{ id: string }>(
      `insert into communication_messages (
         organization_id,
         conversation_id,
         channel_account_id,
         external_message_id,
         idempotency_key,
         direction,
         message_type,
         status,
         provider_status,
         provider_timestamp,
         metadata
       ) values (
         $1, $2, $3, $4, $5, 'OUTBOUND', 'template',
         'SENT', 'accepted', now(), $6::jsonb
       )
       returning id`,
      [
        job.organization_id,
        conversationId,
        job.channel_account_id,
        result.externalMessageId,
        'campaign:' + job.recipient_id,
        JSON.stringify({
          campaignId: job.campaign_id,
          templateId: job.template_id,
          providerResponse: result.providerResponse,
        }),
      ],
    );

    await client.query(
      `insert into saas_usage_ledger (
         organization_id,
         meter_key,
         quantity,
         unit,
         source_type,
         source_id,
         idempotency_key,
         metadata
       ) values ($1, 'whatsapp.messages', 1, 'message',
                 'WHATSAPP_CAMPAIGN', $2, $3, $4::jsonb)
       on conflict (organization_id, idempotency_key) do nothing`,
      [
        job.organization_id,
        message.rows[0].id,
        'whatsapp-message:' + message.rows[0].id,
        JSON.stringify({
          campaignId: job.campaign_id,
          recipientId: job.recipient_id,
          templateId: job.template_id,
        }),
      ],
    );

    await client.query(
      `update communication_conversations
       set last_outbound_at = now(),
           last_message_at = now(),
           updated_at = now()
       where id = $1`,
      [conversationId],
    );
    await client.query(
      `update communication_campaign_recipients
       set status = 'SENT',
           message_id = $2,
           processing_started_at = null,
           failure_reason = null,
           updated_at = now()
       where id = $1`,
      [job.recipient_id, message.rows[0].id],
    );
    await client.query(
      `insert into outbox_events (
         organization_id,
         event_type,
         aggregate_type,
         aggregate_id,
         payload
       ) values ($1, 'communication.campaign.recipient_sent.v1',
                 'campaign_recipient', $2, $3::jsonb)`,
      [
        job.organization_id,
        job.recipient_id,
        JSON.stringify({
          campaignId: job.campaign_id,
          recipientId: job.recipient_id,
          messageId: message.rows[0].id,
          externalMessageId: result.externalMessageId,
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
async function markSkipped(
  pool: Pool,
  job: CampaignRecipientJob,
  reason: string,
) {
  await pool.query(
    `update communication_campaign_recipients
     set status = 'SKIPPED',
         processing_started_at = null,
         failure_reason = left($2, 4000),
         updated_at = now()
     where id = $1`,
    [job.recipient_id, reason],
  );
}

async function markFailure(
  pool: Pool,
  job: CampaignRecipientJob,
  error: unknown,
) {
  const message =
    error instanceof Error ? error.message : String(error);
  const ambiguous =
    error instanceof ProviderSendError && error.ambiguous;
  const status = ambiguous ? 'UNKNOWN' : 'FAILED';

  await pool.query(
    `update communication_campaign_recipients
     set status = $2,
         processing_started_at = null,
         failure_reason = left($3, 4000),
         updated_at = now()
     where id = $1`,
    [job.recipient_id, status, message],
  );

  if (ambiguous) {
    await pool.query(
      `update communication_campaigns
       set status = 'ACTION_REQUIRED',
           updated_at = now()
       where id = $1`,
      [job.campaign_id],
    );
  }
}

export async function reconcileCampaign(
  pool: Pool,
  campaignId: string,
) {
  const result = await pool.query<{
    status: string;
    count: string;
  }>(
    `select status, count(*)::text as count
     from communication_campaign_recipients
     where campaign_id = $1
     group by status`,
    [campaignId],
  );
  const counts = new Map(
    result.rows.map((row) => [
      row.status,
      Number.parseInt(row.count, 10),
    ]),
  );

  const unknown = counts.get('UNKNOWN') ?? 0;
  const pending = counts.get('PENDING') ?? 0;
  const processing = counts.get('PROCESSING') ?? 0;
  const failed = counts.get('FAILED') ?? 0;
  const skipped = counts.get('SKIPPED') ?? 0;

  if (unknown) {
    await pool.query(
      `update communication_campaigns
       set status = 'ACTION_REQUIRED', updated_at = now()
       where id = $1`,
      [campaignId],
    );
    return;
  }

  if (pending || processing) {
    await pool.query(
      `update communication_campaigns
       set status = 'RUNNING',
           started_at = coalesce(started_at, now()),
           updated_at = now()
       where id = $1`,
      [campaignId],
    );
    return;
  }

  const status =
    failed || skipped ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
  await pool.query(
    `update communication_campaigns
     set status = $2,
         completed_at = coalesce(completed_at, now()),
         updated_at = now()
     where id = $1`,
    [campaignId, status],
  );
}

export async function dispatchCampaignJob(
  pool: Pool,
  job: CampaignRecipientJob,
) {
  try {
    const consent = await hasConsent(pool, job);
    if (!consent) {
      await markSkipped(
        pool,
        job,
        'Consent no longer permits this WhatsApp campaign.',
      );
      return;
    }

    await assertCommercialUsage(
      pool,
      job.organization_id,
      'whatsapp.messages',
      1,
    );
    const result = await sendTemplate(job);
    await persistSuccess(pool, job, result);
  } catch (error) {
    await markFailure(pool, job, error);
  } finally {
    await reconcileCampaign(pool, job.campaign_id);
  }
}
