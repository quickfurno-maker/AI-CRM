import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../../platform/database/database.service.js';
import { RateLimitService } from '../../platform/rate-limit/rate-limit.service.js';

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly rateLimits: RateLimitService,
  ) {}

  live() {
    return {
      status: 'live',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  async ready() {
    const [database, redis] = await Promise.all([
      this.database.health().catch(() => false),
      this.rateLimits.checkRedis(),
    ]);
    return {
      ready: database && redis,
      database,
      redis,
      timestamp: new Date().toISOString(),
    };
  }

  async runtime() {
    const outbox = await this.database.pool.query<{
      status: string;
      count: string;
    }>(
      `select status, count(*)::text as count
       from outbox_events
       where status <> 'PROCESSED'
       group by status
       order by status`,
    );
    const ready = await this.ready();
    return {
      ...this.live(),
      ready,
      environment: this.config.get<string>('NODE_ENV', 'development'),
      transports: {
        meta: this.config.get<string>('META_TRANSPORT_MODE', 'disabled'),
        ai: this.config.get<string>('AI_TRANSPORT_MODE', 'disabled'),
        payment: this.config.get<string>('SAAS_PAYMENT_MODE', 'disabled'),
      },
      consumers: {
        aiWhatsapp: this.config.get<boolean>(
          'AI_WHATSAPP_EVENT_CONSUMER_ENABLED',
          false,
        ),
        automation: this.config.get<boolean>(
          'AUTOMATION_EVENT_CONSUMER_ENABLED',
          false,
        ),
        scheduler: this.config.get<boolean>(
          'AUTOMATION_SCHEDULER_ENABLED',
          false,
        ),
      },
      rateLimit: this.rateLimits.health(),
      outbox: Object.fromEntries(
        outbox.rows.map((row) => [row.status, Number(row.count)]),
      ),
      memory: {
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsedMb: Math.round(
          process.memoryUsage().heapUsed / 1024 / 1024,
        ),
      },
    };
  }
}
