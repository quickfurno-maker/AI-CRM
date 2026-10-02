import { Redis } from 'ioredis';
import { Pool } from 'pg';
import {
  dispatchCampaignJob,
  type CampaignRecipientJob,
} from './campaign-dispatch.js';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://crm_ai:crm_ai_dev@localhost:15432/crm_ai';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:16379';
const eventStream = process.env.EVENT_STREAM ?? 'crm-ai:events';

const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

let stopping = false;

type OutboxRow = {
  id: string;
  organization_id: string | null;
  event_type: string;
  version: number;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  attempts: number;
  correlation_id: string | null;
  causation_id: string | null;
  created_at: Date;
};

async function resetStaleClaims() {
  await pool.query(`
    update outbox_events
    set status = 'PENDING', processing_started_at = null
    where status = 'PROCESSING'
      and processing_started_at < now() - interval '5 minutes'
  `);
}

async function resetStaleCampaignClaims() {
  const stale = await pool.query<{ campaign_id: string }>(`
    update communication_campaign_recipients
    set status = 'UNKNOWN',
        processing_started_at = null,
        failure_reason = coalesce(
          failure_reason,
          'Worker stopped after provider dispatch began; manual reconciliation required.'
        ),
        updated_at = now()
    where status = 'PROCESSING'
      and processing_started_at < now() - interval '5 minutes'
    returning campaign_id
  `);

  if (stale.rows.length) {
    const ids = [...new Set(stale.rows.map((row) => row.campaign_id))];
    await pool.query(
      `update communication_campaigns
       set status = 'ACTION_REQUIRED', updated_at = now()
       where id = any($1::uuid[])`,
      [ids],
    );
  }
}

async function claimCampaignBatch(): Promise<CampaignRecipientJob[]> {
  const claimed = await pool.query<{ id: string }>(`
    with picked as (
      select recipient.id
      from communication_campaign_recipients recipient
      join communication_campaigns campaign
        on campaign.id = recipient.campaign_id
      where recipient.status = 'PENDING'
        and campaign.status in ('QUEUED', 'RUNNING', 'SCHEDULED')
        and (
          campaign.scheduled_at is null
          or campaign.scheduled_at <= now()
        )
      order by recipient.created_at
      limit 20
      for update of recipient skip locked
    )
    update communication_campaign_recipients as recipient
    set status = 'PROCESSING',
        attempts = recipient.attempts + 1,
        processing_started_at = now(),
        last_attempt_at = now(),
        failure_reason = null,
        updated_at = now()
    from picked
    where recipient.id = picked.id
    returning recipient.id
  `);

  const ids = claimed.rows.map((row) => row.id);
  if (!ids.length) return [];

  const result = await pool.query<CampaignRecipientJob>(`
    select
      recipient.id as recipient_id,
      recipient.organization_id,
      recipient.contact_id,
      recipient.destination,
      campaign.id as campaign_id,
      campaign.workspace_id,
      campaign.channel_account_id,
      campaign.template_id,
      template.name as template_name,
      template.language as template_language,
      template.category as template_category,
      template.components as template_components,
      channel.provider_phone_number_id,
      channel.credential_ref,
      channel.status as channel_status
    from communication_campaign_recipients recipient
    join communication_campaigns campaign
      on campaign.id = recipient.campaign_id
    join communication_message_templates template
      on template.id = campaign.template_id
    join communication_channel_accounts channel
      on channel.id = campaign.channel_account_id
    where recipient.id = any($1::uuid[])
  `, [ids]);

  return result.rows;
}

async function claimBatch(): Promise<OutboxRow[]> {
  const result = await pool.query<OutboxRow>(`
    with picked as (
      select id
      from outbox_events
      where status = 'PENDING' and available_at <= now()
      order by created_at
      limit 50
      for update skip locked
    )
    update outbox_events as event
    set status = 'PROCESSING',
        attempts = event.attempts + 1,
        processing_started_at = now(),
        last_error = null
    from picked
    where event.id = picked.id
    returning event.*
  `);
  return result.rows;
}

async function publish(event: OutboxRow) {
  await redis.xadd(
    eventStream,
    'MAXLEN',
    '~',
    '100000',
    '*',
    'id',
    event.id,
    'eventType',
    event.event_type,
    'version',
    String(event.version),
    'organizationId',
    event.organization_id ?? '',
    'aggregateType',
    event.aggregate_type,
    'aggregateId',
    event.aggregate_id,
    'payload',
    JSON.stringify(event.payload),
    'correlationId',
    event.correlation_id ?? '',
    'causationId',
    event.causation_id ?? '',
    'createdAt',
    event.created_at.toISOString(),
  );

  await pool.query(
    `update outbox_events
     set status = 'PROCESSED', processed_at = now(), processing_started_at = null
     where id = $1`,
    [event.id],
  );
}

async function fail(event: OutboxRow, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await pool.query(
    `update outbox_events
     set status = case when attempts >= 10 then 'FAILED' else 'PENDING' end,
         available_at = now() + (interval '5 seconds' * least(attempts, 60)),
         processing_started_at = null,
         last_error = left($2, 4000)
     where id = $1`,
    [event.id, message],
  );
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runLoop() {
  await resetStaleClaims();
  await resetStaleCampaignClaims();

  while (!stopping) {
    const [outboxBatch, campaignBatch] = await Promise.all([
      claimBatch(),
      claimCampaignBatch(),
    ]);

    if (!outboxBatch.length && !campaignBatch.length) {
      await sleep(500);
      continue;
    }

    for (const event of outboxBatch) {
      if (stopping) break;
      try {
        await publish(event);
      } catch (error) {
        console.error('[worker] outbox publish failed', event.id, error);
        await fail(event, error);
      }
    }

    for (const job of campaignBatch) {
      if (stopping) break;
      try {
        await dispatchCampaignJob(pool, job);
      } catch (error) {
        console.error(
          '[worker] campaign dispatch reconciliation failed',
          job.recipient_id,
          error,
        );
      }
    }
  }
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] received ${signal}; draining`);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

async function bootstrap() {
  await redis.connect();
  await pool.query('select 1');
  console.log('[worker] database and Redis connected');
  console.log(`[worker] publishing outbox events to ${eventStream}`);
  console.log('[worker] WhatsApp campaign dispatcher active');
  await runLoop();
  await redis.quit();
  await pool.end();
  console.log('[worker] stopped cleanly');
}

bootstrap().catch(async (error) => {
  console.error('[worker] fatal startup error', error);
  await Promise.allSettled([redis.quit(), pool.end()]);
  process.exit(1);
});
