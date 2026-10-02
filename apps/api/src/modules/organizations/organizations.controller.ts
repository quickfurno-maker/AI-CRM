import { Controller, Get } from '@nestjs/common';
import type { Principal } from '../../platform/auth/auth.types.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { RequirePermission } from '../../platform/permissions/require-permission.decorator.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('organization')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get('current')
  @RequirePermission('organization.read')
  async current(@CurrentPrincipal() principal: Principal) {
    return {
      ...(await this.organizations.getCurrent(principal.organizationId)),
      isPlatformAdmin: principal.isPlatformAdmin,
    };
  }
}
