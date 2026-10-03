import { Global, Module } from '@nestjs/common';
import { PaymentGatewayAdminController, PaymentGatewayController } from './payment-gateway.controller.js';
import { PaymentGatewayService } from './payment-gateway.service.js';
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
    PaymentGatewayController,
    PaymentGatewayAdminController,
  ],
  providers: [
    SaasCommercialService,
    SaasCommercialAdminService,
    SaasCommercialEntitlementsService,
    SaasUsageMeterService,
    PaymentGatewayService,
  ],
  exports: [
    SaasCommercialService,
    SaasCommercialEntitlementsService,
    SaasUsageMeterService,
    PaymentGatewayService,
  ],
})
export class SaasCommercialModule {}
