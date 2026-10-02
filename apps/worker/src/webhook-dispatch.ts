import {
  createDecipheriv,
  createHash,
  createHmac,
} from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import type { Pool } from 'pg';

export type WebhookDeliveryJob = {
  delivery_id: string;
  organization_id: string;
  endpoint_id: string;
  event_id: string;
  event_type: string;
  event_version: number;
  payload: Record<string, unknown>;
  attempts: number;
  created_at: Date;
  url: string;
  signing_secret_ciphertext: string;
};

const blockedNetworks = new BlockList();
blockedNetworks.addSubnet('10.0.0.0', 8, 'ipv4');
blockedNetworks.addSubnet('172.16.0.0', 12, 'ipv4');
blockedNetworks.addSubnet('192.168.0.0', 16, 'ipv4');
blockedNetworks.addSubnet('127.0.0.0', 8, 'ipv4');
blockedNetworks.addSubnet('169.254.0.0', 16, 'ipv4');
blockedNetworks.addSubnet('0.0.0.0', 8, 'ipv4');
blockedNetworks.addSubnet('224.0.0.0', 4, 'ipv4');
blockedNetworks.addSubnet('::1', 128, 'ipv6');
blockedNetworks.addSubnet('fc00::', 7, 'ipv6');
blockedNetworks.addSubnet('fe80::', 10, 'ipv6');

function decryptSecret(value: string) {
  const configured = process.env.PLATFORM_SECRET_ENCRYPTION_KEY;
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new Error(
      'PLATFORM_SECRET_ENCRYPTION_KEY is required for webhook delivery in production.',
    );
  }
  const keySource =
    configured ??
    'dev-only-platform-encryption-key-change-before-production';
  const key = createHash('sha256').update(keySource).digest();
  const [version, ivText, tagText, encryptedText] = value.split('.');
  if (
    version !== 'v1' ||
    !ivText ||
    !tagText ||
    !encryptedText
  ) {
    throw new Error('Invalid encrypted webhook secret.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivText, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

async function assertSafeUrl(raw: string) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Webhook protocol is not allowed.');
  }
  if (
    process.env.NODE_ENV === 'production' &&
    url.protocol !== 'https:'
  ) {
    throw new Error('Production webhooks require HTTPS.');
  }

  const hostname = url.hostname;
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(hostname, { all: true, verbatim: true });

  if (process.env.NODE_ENV === 'production') {
    for (const address of addresses) {
      if (
        blockedNetworks.check(
          address.address,
          address.family === 4 ? 'ipv4' : 'ipv6',
        )
      ) {
        throw new Error('Webhook target resolves to a private network.');
      }
    }
  }
  return url;
}

export async function resetStaleWebhookClaims(pool: Pool) {
  await pool.query(`
    update developer_webhook_deliveries
    set status = 'PENDING',
        processing_started_at = null,
        last_error = coalesce(
          last_error,
          'Worker restarted during webhook delivery; retrying with the same delivery id.'
        ),
        updated_at = now()
    where status = 'PROCESSING'
      and processing_started_at < now() - interval '5 minutes'
  `);
}

export async function claimWebhookBatch(
  pool: Pool,
): Promise<WebhookDeliveryJob[]> {
  const claimed = await pool.query<{ id: string }>(`
    with picked as (
      select delivery.id
      from developer_webhook_deliveries delivery
      join developer_webhook_endpoints endpoint
        on endpoint.id = delivery.endpoint_id
      where delivery.status in ('PENDING', 'RETRY')
        and delivery.next_attempt_at <= now()
        and endpoint.status = 'ACTIVE'
      order by delivery.created_at
      limit 20
      for update of delivery skip locked
    )
    update developer_webhook_deliveries as delivery
    set status = 'PROCESSING',
        attempts = delivery.attempts + 1,
        processing_started_at = now(),
        last_error = null,
        updated_at = now()
    from picked
    where delivery.id = picked.id
    returning delivery.id
  `);

  const ids = claimed.rows.map((row) => row.id);
  if (!ids.length) return [];

  const result = await pool.query<WebhookDeliveryJob>(
    `
      select
        delivery.id as delivery_id,
        delivery.organization_id,
        delivery.endpoint_id,
        delivery.event_id,
        delivery.event_type,
        delivery.event_version,
        delivery.payload,
        delivery.attempts,
        delivery.created_at,
        endpoint.url,
        endpoint.signing_secret_ciphertext
      from developer_webhook_deliveries delivery
      join developer_webhook_endpoints endpoint
        on endpoint.id = delivery.endpoint_id
      where delivery.id = any($1::uuid[])
    `,
    [ids],
  );
  return result.rows;
}

export async function dispatchWebhook(
  pool: Pool,
  job: WebhookDeliveryJob,
) {
  await assertSafeUrl(job.url);
  const secret = decryptSecret(job.signing_secret_ciphertext);
  const envelope = {
    id: job.event_id,
    type: job.event_type,
    version: job.event_version,
    createdAt: job.created_at.toISOString(),
    data: job.payload,
  };
  const body = JSON.stringify(envelope);
  const signature =
    'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

  let response: Response;
  try {
    response = await fetch(job.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'CRM-AI-Webhooks/1.0',
        'x-crm-ai-event': job.event_type,
        'x-crm-ai-delivery': job.delivery_id,
        'x-crm-ai-signature': signature,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    await failWebhook(pool, job, error);
    return;
  }

  const responseBody = (await response.text()).slice(0, 2000);
  if (!response.ok) {
    await failWebhook(
      pool,
      job,
      new Error(
        `Webhook returned HTTP ${response.status}: ${responseBody}`,
      ),
      response.status,
      responseBody,
    );
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `update developer_webhook_deliveries
       set status = 'DELIVERED',
           response_status = $2,
           response_body = $3,
           delivered_at = now(),
           processing_started_at = null,
           updated_at = now()
       where id = $1`,
      [job.delivery_id, response.status, responseBody],
    );
    await client.query(
      `update developer_webhook_endpoints
       set failure_count = 0,
           last_success_at = now(),
           updated_at = now()
       where id = $1`,
      [job.endpoint_id],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function failWebhook(
  pool: Pool,
  job: WebhookDeliveryJob,
  error: unknown,
  responseStatus?: number,
  responseBody?: string,
) {
  const message = error instanceof Error ? error.message : String(error);
  const terminal = job.attempts >= 8;
  const delaySeconds = Math.min(
    3600,
    5 * Math.pow(2, Math.max(job.attempts - 1, 0)),
  );

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `update developer_webhook_deliveries
       set status = $2,
           next_attempt_at = now() + make_interval(secs => $3),
           response_status = $4,
           response_body = $5,
           processing_started_at = null,
           last_error = left($6, 4000),
           updated_at = now()
       where id = $1`,
      [
        job.delivery_id,
        terminal ? 'FAILED' : 'RETRY',
        delaySeconds,
        responseStatus ?? null,
        responseBody ?? null,
        message,
      ],
    );
    await client.query(
      `update developer_webhook_endpoints
       set failure_count = failure_count + 1,
           last_failure_at = now(),
           status = case
             when failure_count + 1 >= 20 then 'PAUSED'
             else status
           end,
           updated_at = now()
       where id = $1`,
      [job.endpoint_id],
    );
    await client.query('commit');
  } catch (transactionError) {
    await client.query('rollback');
    throw transactionError;
  } finally {
    client.release();
  }
}

export async function applyEnterpriseRetention(pool: Pool) {
  await pool.query(`
    delete from audit_logs audit
    using enterprise_security_policies policy,
          entitlements entitlement
    where audit.organization_id = policy.organization_id
      and entitlement.organization_id = policy.organization_id
      and entitlement.key = 'enterprise.controls'
      and entitlement.enabled = true
      and audit.created_at <
        now() - make_interval(days => policy.audit_retention_days)
  `);
}
