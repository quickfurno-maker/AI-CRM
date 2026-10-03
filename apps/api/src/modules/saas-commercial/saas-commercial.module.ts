import { Global, Module } from '@nestjs/common';
import { SaasCommercialAdminController } from './saas-commercial-admin.controller.js';
import { SaasCommercialAdminService } from './saas-commercial-admin.service.js';
import { SaasCommercialEntitlementsService } from './saas-commercial-entitlements.service.js';
import { SaasCommercialController } from './saas-commercial.controller.js';
import { SaasCommercialService } from './saas-commercial.service.js';
import { SaasUsageMeterService } from './saas-usage-meter.service.js';

@Global()
@Module({
  controllers: [
    SaasCommercialController,
    SaasCommercialAdminController,
  ],
  providers: [
    SaasCommercialService,
    SaasCommercialAdminService,
    SaasCommercialEntitlementsService,
    SaasUsageMeterService,
  ],
  exports: [
    SaasCommercialService,
    SaasCommercialEntitlementsService,
    SaasUsageMeterService,
  ],
})
export class SaasCommercialModule {}
