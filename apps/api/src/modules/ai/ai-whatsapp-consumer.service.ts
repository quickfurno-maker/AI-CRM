import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { hostname } from 'node:os';
import { AiWhatsappService } from './ai-whatsapp.service.js';

type StreamMessage = [string, string[]];

@Injectable()
export class AiWhatsappConsumerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AiWhatsappConsumerService.name);
  private redis?: Redis;
  private running = false;
  private loopPromise?: Promise<void>;

  constructor(
    private readonly config: ConfigService,
    private readonly whatsapp: AiWhatsappService,
  ) {}

  async onApplicationBootstrap() {
    const enabled =
      this.config.get<boolean>('AI_WHATSAPP_EVENT_CONSUMER_ENABLED') ??
      false;
    if (!enabled) return;

    const redisUrl =
      this.config.get<string>('REDIS_URL') ??
      'redis://localhost:56379';
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    await this.redis.connect();
    await this.ensureGroup();
    this.running = true;
    this.loopPromise = this.consumeLoop();
  }

  async onApplicationShutdown() {
    this.running = false;
    if (this.redis) {
      this.redis.disconnect();
    }
    try {
      await this.loopPromise;
    } catch {
      // Shutdown is already in progress.
    }
  }

  private stream() {
    return this.config.get<string>('EVENT_STREAM') ?? 'crm-ai:events';
  }

  private group() {
    return (
      this.config.get<string>('AI_WHATSAPP_CONSUMER_GROUP') ??
      'crm-ai:ai-whatsapp'
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
          10,
          'BLOCK',
          5000,
          'STREAMS',
          this.stream(),
          '>',
        );

        if (!rows) continue;
        for (const streamRow of rows) {
          const messages = streamRow[1] as StreamMessage[];
          for (const message of messages) {
            await this.handleStreamMessage(message);
          }
        }
      } catch (error) {
        if (!this.running) break;
        this.logger.error(
          'AI WhatsApp event consumer iteration failed.',
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
      '10',
    )) as unknown;

    if (!Array.isArray(result)) return;
    const messages = result[1];
    if (!Array.isArray(messages)) return;

    for (const message of messages as StreamMessage[]) {
      await this.handleStreamMessage(message);
    }
  }

  private async handleStreamMessage([id, fields]: StreamMessage) {
    if (!this.redis) return;

    const data = new Map<string, string>();
    for (let index = 0; index < fields.length; index += 2) {
      const key = fields[index];
      const value = fields[index + 1];
      if (key !== undefined && value !== undefined) {
        data.set(key, value);
      }
    }

    const eventType = data.get('eventType');
    if (eventType !== 'communication.message.received.v1') {
      await this.redis.xack(this.stream(), this.group(), id);
      return;
    }

    const payloadRaw = data.get('payload');
    let payload: Record<string, unknown> = {};
    try {
      payload = payloadRaw
        ? (JSON.parse(payloadRaw) as Record<string, unknown>)
        : {};
    } catch {
      this.logger.warn(
        'Ignoring malformed communication.message.received payload.',
      );
      await this.redis.xack(this.stream(), this.group(), id);
      return;
    }

    const messageId =
      typeof payload.messageId === 'string'
        ? payload.messageId
        : undefined;

    if (!messageId) {
      await this.redis.xack(this.stream(), this.group(), id);
      return;
    }

    try {
      await this.whatsapp.processInboundMessage(messageId);
      await this.redis.xack(this.stream(), this.group(), id);
    } catch (error) {
      this.logger.error(
        'AI WhatsApp inbound processing failed; event remains pending for reclaim.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
