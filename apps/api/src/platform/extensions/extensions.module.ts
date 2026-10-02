import { Global, Module } from '@nestjs/common';
import { EntitlementGuard } from './entitlement.guard.js';
import { ExtensionRegistryService } from './extension-registry.service.js';
import { ExtensionsController } from './extensions.controller.js';

@Global()
@Module({
  controllers: [ExtensionsController],
  providers: [ExtensionRegistryService, EntitlementGuard],
  exports: [ExtensionRegistryService, EntitlementGuard],
})
export class ExtensionsModule {}
