import { Controller, Get } from '@nestjs/common';
import type { Principal } from '../auth/auth.types.js';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import { ExtensionRegistryService } from './extension-registry.service.js';

@Controller('extensions')
export class ExtensionsController {
  constructor(private readonly registry: ExtensionRegistryService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.registry.listForTenant(principal);
  }
}
