import { Redis } from 'ioredis';
import { Pool } from 'pg';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://crm_ai:crm_ai_dev@localhost:55432/crm_ai';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:56379';
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
  while (!stopping) {
    const batch = await claimBatch();
    if (!batch.length) {
      await sleep(500);
      continue;
    }

    for (const event of batch) {
      if (stopping) break;
      try {
        await publish(event);
      } catch (error) {
        console.error('[worker] outbox publish failed', event.id, error);
        await fail(event, error);
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
