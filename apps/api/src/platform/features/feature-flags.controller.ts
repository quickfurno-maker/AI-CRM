import { Controller, Get } from '@nestjs/common';
import type { Principal } from '../auth/auth.types.js';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { FeatureFlagsService } from './feature-flags.service.js';

@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  @RequirePermission('feature_flags.read')
  list(@CurrentPrincipal() principal: Principal) {
    return this.flags.list(principal.organizationId);
  }
}
