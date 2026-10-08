import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './all-schema.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;
  readonly db: NodePgDatabase<typeof schema>;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: config.get<number>('DATABASE_POOL_MAX', 8),
      idleTimeoutMillis: config.get<number>('DATABASE_POOL_IDLE_TIMEOUT_MS', 30_000),
      connectionTimeoutMillis: config.get<number>('DATABASE_POOL_CONNECTION_TIMEOUT_MS', 5_000),
    });

    this.db = drizzle(this.pool, { schema });
  }

  async health(): Promise<boolean> {
    const result = await this.pool.query<{ ok: number }>('select 1 as ok');
    return result.rows[0]?.ok === 1;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
