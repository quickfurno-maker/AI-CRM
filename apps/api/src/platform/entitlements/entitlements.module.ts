import { Global, Module } from '@nestjs/common';
import { EntitlementsController } from './entitlements.controller.js';
import { EntitlementsService } from './entitlements.service.js';
import { PlansBootstrapService } from './plans.bootstrap.js';

@Global()
@Module({
  controllers: [EntitlementsController],
  providers: [EntitlementsService, PlansBootstrapService],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
