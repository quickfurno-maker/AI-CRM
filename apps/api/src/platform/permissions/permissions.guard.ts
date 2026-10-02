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
import { PermissionsService } from './permissions.service.js';
import { REQUIRED_PERMISSION_KEY } from './require-permission.decorator.js';

type RequestWithPrincipal = Request & { principal?: Principal };

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const permission = this.reflector.getAllAndOverride<string>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) return true;

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const principal = request.principal;
    if (!principal) throw new ForbiddenException('Missing tenant principal.');
    if (principal.isPlatformAdmin) return true;

    const allowed = await this.permissions.hasPermission({
      organizationId: principal.organizationId,
      membershipId: principal.membershipId,
      permission,
    });

    if (!allowed) {
      throw new ForbiddenException('Permission denied.');
    }
    return true;
  }
}
