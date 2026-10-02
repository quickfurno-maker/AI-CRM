import { Module } from '@nestjs/common';
import { BusinessBillingController } from './business-billing.controller.js';
import { BusinessBillingService } from './business-billing.service.js';

@Module({
  controllers: [BusinessBillingController],
  providers: [BusinessBillingService],
  exports: [BusinessBillingService],
})
export class BusinessBillingModule {}
