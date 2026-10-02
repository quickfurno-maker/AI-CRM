import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { outboxEvents } from '../database/schema.js';

type OutboxEventInput = {
  organizationId?: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  correlationId?: string;
  causationId?: string;
  version?: number;
};

@Injectable()
export class OutboxService {
  constructor(private readonly database: DatabaseService) {}

  enqueue(event: OutboxEventInput) {
    return this.database.db.insert(outboxEvents).values({
      organizationId: event.organizationId,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
      correlationId: event.correlationId,
      causationId: event.causationId,
      version: event.version ?? 1,
    });
  }
}
