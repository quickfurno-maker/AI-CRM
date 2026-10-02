import { Module } from '@nestjs/common';
import { ContactsService } from './contacts.service.js';
import { CrmController } from './crm.controller.js';
import { CrmProvisioningService } from './crm-provisioning.service.js';
import { CrmReferenceService } from './crm-reference.service.js';
import { CrmSettingsService } from './crm-settings.service.js';
import { EngagementService } from './engagement.service.js';
import { SalesService } from './sales.service.js';

@Module({
  controllers: [CrmController],
  providers: [
    ContactsService,
    SalesService,
    EngagementService,
    CrmSettingsService,
    CrmProvisioningService,
    CrmReferenceService,
  ],
  exports: [ContactsService, SalesService, EngagementService],
})
export class CrmModule {}
