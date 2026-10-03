import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

type CounterResult = {
  count: number;
  retryAfterSeconds: number;
  source: 'redis' | 'memory';
};

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly redis: Redis;
  private redisHealthy = true;
  private lastRedisWarningAt = 0;
  private readonly memory = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(private readonly config: ConfigService) {
    this.redis = new Redis(
      this.config.get<string>('REDIS_URL') ??
        'redis://localhost:16379',
      {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 1500,
        commandTimeout: 1500,
        enableOfflineQueue: false,
      },
    );
    this.redis.on('error', () => {
      this.redisHealthy = false;
    });
    this.redis.on('ready', () => {
      this.redisHealthy = true;
    });
  }

  enabled() {
    return this.config.get<boolean>('RATE_LIMIT_ENABLED') ?? true;
  }

  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<CounterResult> {
    if (!this.enabled()) {
      return {
        count: 0,
        retryAfterSeconds: 0,
        source: 'memory',
      };
    }

    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }
      const result = (await this.redis.eval(
        `
        local count = redis.call('INCR', KEYS[1])
        if count == 1 then
          redis.call('EXPIRE', KEYS[1], ARGV[1])
        end
        local ttl = redis.call('TTL', KEYS[1])
        return {count, ttl}
        `,
        1,
        'crm-ai:ratelimit:' + key,
        String(windowSeconds),
      )) as [number, number];

      this.redisHealthy = true;
      return {
        count: Number(result[0]),
        retryAfterSeconds: Math.max(Number(result[1]), 1),
        source: 'redis',
      };
    } catch (error) {
      this.redisHealthy = false;
      const now = Date.now();
      if (now - this.lastRedisWarningAt > 60_000) {
        this.lastRedisWarningAt = now;
        this.logger.warn(
          'Redis rate-limit store unavailable; using bounded in-memory fallback.',
        );
      }
      return this.consumeMemory(key, windowSeconds);
    }
  }

  health() {
    return {
      enabled: this.enabled(),
      redisHealthy: this.redisHealthy,
      fallbackKeys: this.memory.size,
    };
  }

  async onModuleDestroy() {
    this.redis.disconnect();
  }

  private consumeMemory(
    key: string,
    windowSeconds: number,
  ): CounterResult {
    const now = Date.now();
    this.sweepMemory(now);
    const existing = this.memory.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowSeconds * 1000;
      this.memory.set(key, { count: 1, resetAt });
      return {
        count: 1,
        retryAfterSeconds: windowSeconds,
        source: 'memory',
      };
    }
    existing.count += 1;
    return {
      count: existing.count,
      retryAfterSeconds: Math.max(
        Math.ceil((existing.resetAt - now) / 1000),
        1,
      ),
      source: 'memory',
    };
  }

  private sweepMemory(now: number) {
    if (this.memory.size < 10_000) return;
    for (const [key, value] of this.memory) {
      if (value.resetAt <= now) this.memory.delete(key);
    }
    if (this.memory.size > 20_000) {
      const keys = [...this.memory.keys()].slice(
        0,
        this.memory.size - 20_000,
      );
      for (const key of keys) this.memory.delete(key);
    }
  }
}
