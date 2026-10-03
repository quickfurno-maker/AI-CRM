import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { Principal } from '../auth/auth.types.js';
import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
} from './rate-limit.decorator.js';
import { RateLimitService } from './rate-limit.service.js';

type RequestWithPrincipal = Request & { principal?: Principal };

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly limits: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (!this.limits.enabled()) return true;
    const request =
      context.switchToHttp().getRequest<RequestWithPrincipal>();
    const response = context.switchToHttp().getResponse<Response>();
    const override = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    const policy = override ?? this.defaultPolicy(request);
    const identity = this.identity(request, policy.scope);
    const routeKey = this.routeKey(request);
    const result = await this.limits.consume(
      policy.scope === 'IP'
        ? 'ip:' + identity + ':' + routeKey
        : 'identity:' + identity + ':' + routeKey,
      policy.limit,
      policy.windowSeconds ?? 60,
    );

    response.setHeader('x-ratelimit-limit', String(policy.limit));
    response.setHeader(
      'x-ratelimit-remaining',
      String(Math.max(policy.limit - result.count, 0)),
    );
    response.setHeader(
      'x-ratelimit-store',
      result.source,
    );

    if (result.count > policy.limit) {
      response.setHeader(
        'retry-after',
        String(result.retryAfterSeconds),
      );
      throw new HttpException(
        {
          statusCode: 429,
          message:
            'Request rate limit exceeded. Retry after the indicated interval.',
          retryAfterSeconds: result.retryAfterSeconds,
        },
        429,
      );
    }
    return true;
  }

  private defaultPolicy(
    request: RequestWithPrincipal,
  ): RateLimitOptions {
    const path = this.routeKey(request);
    if (path.startsWith('/v1/auth/')) {
      return {
        limit: this.config.get<number>(
          'RATE_LIMIT_AUTH_PER_MINUTE',
          20,
        ),
        windowSeconds: 60,
        scope: 'IP',
      };
    }
    if (
      path.startsWith('/v1/webhooks/') ||
      path.includes('/payment-webhooks/')
    ) {
      return {
        limit: this.config.get<number>(
          'RATE_LIMIT_WEBHOOK_PER_MINUTE',
          1200,
        ),
        windowSeconds: 60,
        scope: 'IP',
      };
    }
    if (
      request.principal?.authType === 'API_KEY' ||
      request.principal?.authType === 'OAUTH'
    ) {
      return {
        limit: this.config.get<number>(
          'RATE_LIMIT_EXTERNAL_PER_MINUTE',
          300,
        ),
        windowSeconds: 60,
        scope: 'IDENTITY',
      };
    }
    if (request.principal) {
      return {
        limit: this.config.get<number>(
          'RATE_LIMIT_SESSION_PER_MINUTE',
          600,
        ),
        windowSeconds: 60,
        scope: 'IDENTITY',
      };
    }
    return {
      limit: this.config.get<number>(
        'RATE_LIMIT_PUBLIC_PER_MINUTE',
        120,
      ),
      windowSeconds: 60,
      scope: 'IP',
    };
  }

  private identity(
    request: RequestWithPrincipal,
    scope: 'IP' | 'IDENTITY' = 'IDENTITY',
  ) {
    if (scope === 'IDENTITY' && request.principal) {
      return (
        request.principal.organizationId +
        ':' +
        (request.principal.actorId ??
          request.principal.membershipId ??
          request.principal.sessionId)
      );
    }
    return request.ip || 'unknown';
  }

  private routeKey(request: Request) {
    const path = request.originalUrl.split('?')[0] ?? request.path;
    return request.method + ':' + path.replace(
      /[0-9a-f]{8}-[0-9a-f-]{27,}/gi,
      ':id',
    );
  }
}
