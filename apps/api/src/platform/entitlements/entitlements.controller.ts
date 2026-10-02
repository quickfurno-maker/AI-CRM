import { Controller, Get } from '@nestjs/common';
import type { Principal } from '../auth/auth.types.js';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import { EntitlementsService } from './entitlements.service.js';

@Controller('capabilities')
export class EntitlementsController {
  constructor(private readonly entitlements: EntitlementsService) {}

  @Get()
  async list(@CurrentPrincipal() principal: Principal) {
    return {
      organizationId: principal.organizationId,
      entitlements: await this.entitlements.list(principal.organizationId),
    };
  }
}
