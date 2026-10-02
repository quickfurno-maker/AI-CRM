import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { Principal } from '../../platform/auth/auth.types.js';

type RequestWithPrincipal = Request & { principal?: Principal };

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    if (!request.principal?.isPlatformAdmin) {
      throw new ForbiddenException('Platform administrator access required.');
    }
    return true;
  }
}
