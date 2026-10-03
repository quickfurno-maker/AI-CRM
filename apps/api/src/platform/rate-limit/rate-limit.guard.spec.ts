import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RateLimitGuard } from './rate-limit.guard.js';
import type { RateLimitService } from './rate-limit.service.js';

function context(ip = '127.0.0.1') {
  const headers = new Map<string, string>();
  const request = {
    method: 'POST',
    originalUrl: '/v1/auth/register',
    path: '/v1/auth/register',
    ip,
  };
  const response = {
    setHeader: vi.fn((name: string, value: string) => {
      headers.set(name, value);
    }),
  };
  return {
    headers,
    value: {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    } as unknown as ExecutionContext,
  };
}

describe('RateLimitGuard', () => {
  it('allows requests inside the bucket and rejects overflow with retry metadata', async () => {
    const consume = vi
      .fn()
      .mockResolvedValueOnce({
        count: 1,
        retryAfterSeconds: 60,
        source: 'memory',
      })
      .mockResolvedValueOnce({
        count: 2,
        retryAfterSeconds: 42,
        source: 'memory',
      });
    const limits = {
      enabled: () => true,
      consume,
    } as unknown as RateLimitService;
    const reflector = {
      getAllAndOverride: () => ({
        limit: 1,
        windowSeconds: 60,
        scope: 'IP' as const,
      }),
    } as unknown as Reflector;
    const config = {
      get: (_key: string, fallback: unknown) => fallback,
    } as unknown as ConfigService;
    const guard = new RateLimitGuard(reflector, config, limits);

    const first = context();
    await expect(guard.canActivate(first.value)).resolves.toBe(true);
    expect(first.headers.get('x-ratelimit-remaining')).toBe('0');

    const second = context();
    await expect(guard.canActivate(second.value)).rejects.toMatchObject({
      status: 429,
    } satisfies Partial<HttpException>);
    expect(second.headers.get('retry-after')).toBe('42');
    expect(consume).toHaveBeenCalledWith(
      'ip:127.0.0.1:POST:/v1/auth/register',
      1,
      60,
    );
  });

  it('bypasses the store entirely when throttling is disabled', async () => {
    const consume = vi.fn();
    const limits = {
      enabled: () => false,
      consume,
    } as unknown as RateLimitService;
    const guard = new RateLimitGuard(
      { getAllAndOverride: () => undefined } as unknown as Reflector,
      { get: (_key: string, fallback: unknown) => fallback } as unknown as ConfigService,
      limits,
    );

    await expect(guard.canActivate(context().value)).resolves.toBe(true);
    expect(consume).not.toHaveBeenCalled();
  });
});
