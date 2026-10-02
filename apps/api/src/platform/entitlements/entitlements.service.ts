import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { entitlements } from '../database/schema.js';

@Injectable()
export class EntitlementsService {
  constructor(private readonly database: DatabaseService) {}

  list(organizationId: string) {
    return this.database.db
      .select({
        key: entitlements.key,
        enabled: entitlements.enabled,
        limitValue: entitlements.limitValue,
        source: entitlements.source,
        config: entitlements.config,
      })
      .from(entitlements)
      .where(eq(entitlements.organizationId, organizationId));
  }

  async can(organizationId: string, key: string): Promise<boolean> {
    const rows = await this.database.db
      .select({ enabled: entitlements.enabled })
      .from(entitlements)
      .where(and(eq(entitlements.organizationId, organizationId), eq(entitlements.key, key)))
      .limit(1);
    return rows[0]?.enabled ?? false;
  }

  async limit(organizationId: string, key: string): Promise<number | null> {
    const rows = await this.database.db
      .select({ enabled: entitlements.enabled, limitValue: entitlements.limitValue })
      .from(entitlements)
      .where(and(eq(entitlements.organizationId, organizationId), eq(entitlements.key, key)))
      .limit(1);
    return rows[0]?.enabled ? (rows[0].limitValue ?? null) : 0;
  }
}
