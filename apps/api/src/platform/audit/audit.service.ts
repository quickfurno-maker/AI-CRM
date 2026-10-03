import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { auditLogs } from '../database/schema.js';

type AuditEntry = {
  organizationId?: string;
  workspaceId?: string;
  actorType: string;
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  requestId?: string;
};

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  record(entry: AuditEntry) {
    return this.database.db.insert(auditLogs).values(entry);
  }

  list(organizationId: string, limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return this.database.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, organizationId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(safeLimit);
  }

  async export(organizationId: string, limit = 5000) {
    const safeLimit = Math.min(Math.max(limit, 1), 5000);
    const records = await this.database.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, organizationId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(safeLimit);
    const generatedAt = new Date().toISOString();
    const canonical = JSON.stringify({
      organizationId,
      generatedAt,
      records,
    });
    return {
      organizationId,
      generatedAt,
      recordCount: records.length,
      integrity: {
        algorithm: 'SHA-256',
        digest: createHash('sha256').update(canonical).digest('hex'),
      },
      records,
    };
  }
}
