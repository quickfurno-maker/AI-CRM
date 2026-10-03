import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'crm_ai:rate_limit';

export type RateLimitOptions = {
  limit: number;
  windowSeconds?: number;
  scope?: 'IP' | 'IDENTITY';
};

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
