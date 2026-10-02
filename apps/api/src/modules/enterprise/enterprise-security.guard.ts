import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import type { Request } from 'express';
import type { Principal } from '../../platform/auth/auth.types.js';
import { IS_PUBLIC_KEY } from '../../platform/auth/public.decorator.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import { sessions, users } from '../../platform/database/schema.js';
import { EntitlementsService } from '../../platform/entitlements/entitlements.service.js';
import { enterpriseSecurityPolicies } from './enterprise.schema.js';
import { isIpAllowed, normalizeClientIp } from './enterprise-ip.js';

type RequestWithPrincipal = Request & { principal?: Principal };

@Injectable()
export class EnterpriseSecurityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly database: DatabaseService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const principal = request.principal;
    if (!principal) return true;

    if (
      !(await this.entitlements.can(
        principal.organizationId,
        'enterprise.controls',
      ))
    ) {
      return true;
    }

    const rows = await this.database.db
      .select()
      .from(enterpriseSecurityPolicies)
      .where(
        eq(
          enterpriseSecurityPolicies.organizationId,
          principal.organizationId,
        ),
      )
      .limit(1);
    const policy = rows[0];
    if (!policy) return true;

    if (policy.enforceIpAllowlist) {
      const ip = normalizeClientIp(request.ip);
      if (!isIpAllowed(ip, policy.ipAllowlist)) {
        throw new ForbiddenException(
          'Request IP is not allowed by enterprise security policy.',
        );
      }
    }

    if (principal.authType === 'SESSION' || !principal.authType) {
      const [session] = await this.database.db
        .select({
          createdAt: sessions.createdAt,
          email: users.email,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
          and(
            eq(sessions.id, principal.sessionId),
            eq(sessions.organizationId, principal.organizationId),
          ),
        )
        .limit(1);
      if (!session) return true;

      const maxAgeMs = policy.sessionMaxMinutes * 60 * 1000;
      if (session.createdAt.getTime() + maxAgeMs < Date.now()) {
        throw new ForbiddenException(
          'Session exceeded the enterprise maximum age.',
        );
      }

      if (policy.allowedEmailDomains.length) {
        const domain = session.email.split('@')[1]?.toLowerCase();
        if (!domain || !policy.allowedEmailDomains.includes(domain)) {
          throw new ForbiddenException(
            'Account email domain is not allowed by enterprise security policy.',
          );
        }
      }
    }

    return true;
  }
}
