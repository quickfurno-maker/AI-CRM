import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Principal } from '../auth/auth.types.js';
import { IS_PUBLIC_KEY } from '../auth/public.decorator.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { REQUIRED_ENTITLEMENT_KEY } from './require-entitlement.decorator.js';

type RequestWithPrincipal = Request & { principal?: Principal };

@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const entitlement = this.reflector.getAllAndOverride<string>(
      REQUIRED_ENTITLEMENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!entitlement) return true;

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const principal = request.principal;
    if (!principal) throw new ForbiddenException('Missing tenant principal.');
    if (principal.isPlatformAdmin) return true;

    const enabled = await this.entitlements.can(
      principal.organizationId,
      entitlement,
    );
    if (!enabled) {
      throw new ForbiddenException(
        `Required extension is not enabled: ${entitlement}.`,
      );
    }
    return true;
  }
}
