import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { hostname } from 'node:os';
import {
  AutomationRuntimeService,
  type AutomationEvent,
} from './automation-runtime.service.js';

type StreamMessage = [string, string[]];

@Injectable()
export class AutomationEventConsumerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AutomationEventConsumerService.name);
  private redis?: Redis;
  private running = false;
  private loopPromise?: Promise<void>;

  constructor(
    private readonly config: ConfigService,
    private readonly runtime: AutomationRuntimeService,
  ) {}

  async onApplicationBootstrap() {
    const enabled =
      this.config.get<boolean>('AUTOMATION_EVENT_CONSUMER_ENABLED') ??
      false;
    if (!enabled) return;

    this.redis = new Redis(
      this.config.get<string>('REDIS_URL') ??
        'redis://localhost:56379',
      {
        lazyConnect: true,
        maxRetriesPerRequest: null,
      },
    );
    await this.redis.connect();
    await this.ensureGroup();
    this.running = true;
    this.loopPromise = this.consumeLoop();
  }

  async onApplicationShutdown() {
    this.running = false;
    this.redis?.disconnect();
    try {
      await this.loopPromise;
    } catch {
      // Application shutdown is already in progress.
    }
  }

  private stream() {
    return this.config.get<string>('EVENT_STREAM') ?? 'crm-ai:events';
  }

  private group() {
    return (
      this.config.get<string>('AUTOMATION_CONSUMER_GROUP') ??
      'crm-ai:automation'
    );
  }

  private consumer() {
    return hostname() + ':' + process.pid;
  }

  private async ensureGroup() {
    if (!this.redis) return;
    try {
      await this.redis.xgroup(
        'CREATE',
        this.stream(),
        this.group(),
        '0',
        'MKSTREAM',
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      if (!message.includes('BUSYGROUP')) throw error;
    }
  }

  private async consumeLoop() {
    if (!this.redis) return;

    while (this.running) {
      try {
        await this.reclaimPending();
        const rows = await this.redis.xreadgroup(
          'GROUP',
          this.group(),
          this.consumer(),
          'COUNT',
          25,
          'BLOCK',
          5000,
          'STREAMS',
          this.stream(),
          '>',
        );
        if (!rows) continue;

        for (const streamRow of rows) {
          for (const message of streamRow[1] as StreamMessage[]) {
            await this.handle(message);
          }
        }
      } catch (error) {
        if (!this.running) break;
        this.logger.error(
          'Automation event consumer iteration failed.',
          error instanceof Error ? error.stack : String(error),
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  private async reclaimPending() {
    if (!this.redis) return;
    const result = (await this.redis.call(
      'XAUTOCLAIM',
      this.stream(),
      this.group(),
      this.consumer(),
      '30000',
      '0-0',
      'COUNT',
      '25',
    )) as unknown;

    if (!Array.isArray(result) || !Array.isArray(result[1])) return;
    for (const message of result[1] as StreamMessage[]) {
      await this.handle(message);
    }
  }

  private async handle([streamId, fields]: StreamMessage) {
    if (!this.redis) return;

    const data = new Map<string, string>();
    for (let index = 0; index < fields.length; index += 2) {
      const key = fields[index];
      const value = fields[index + 1];
      if (key !== undefined && value !== undefined) {
        data.set(key, value);
      }
    }

    const id = data.get('id');
    const eventType = data.get('eventType');
    const organizationId = data.get('organizationId');
    const aggregateType = data.get('aggregateType');
    const aggregateId = data.get('aggregateId');

    if (
      !id ||
      !eventType ||
      !organizationId ||
      !aggregateType ||
      !aggregateId
    ) {
      await this.redis.xack(this.stream(), this.group(), streamId);
      return;
    }

    let payload: Record<string, unknown> = {};
    try {
      const raw = data.get('payload');
      payload = raw
        ? (JSON.parse(raw) as Record<string, unknown>)
        : {};
    } catch {
      this.logger.warn('Skipping malformed automation event payload.');
      await this.redis.xack(this.stream(), this.group(), streamId);
      return;
    }

    const event: AutomationEvent = {
      id,
      eventType,
      organizationId,
      aggregateType,
      aggregateId,
      payload,
      correlationId: data.get('correlationId') || undefined,
      causationId: data.get('causationId') || undefined,
      createdAt: data.get('createdAt') || undefined,
    };

    try {
      await this.runtime.handleEvent(event);
      await this.redis.xack(this.stream(), this.group(), streamId);
    } catch (error) {
      this.logger.error(
        'Automation event processing failed; event remains pending.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
