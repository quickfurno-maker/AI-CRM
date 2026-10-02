import { Injectable } from '@nestjs/common';
import { eq, isNull, or } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { featureFlags } from '../database/schema.js';

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly database: DatabaseService) {}

  async list(organizationId: string) {
    const rows = await this.database.db
      .select({
        organizationId: featureFlags.organizationId,
        key: featureFlags.key,
        enabled: featureFlags.enabled,
        config: featureFlags.config,
      })
      .from(featureFlags)
      .where(or(isNull(featureFlags.organizationId), eq(featureFlags.organizationId, organizationId)));

    const merged = new Map<string, (typeof rows)[number]>();
    for (const row of rows.filter((item) => item.organizationId === null)) merged.set(row.key, row);
    for (const row of rows.filter((item) => item.organizationId === organizationId)) merged.set(row.key, row);
    return [...merged.values()];
  }
}
