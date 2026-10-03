import { Module } from '@nestjs/common';
import { ContactsService } from './contacts.service.js';
import { CrmController } from './crm.controller.js';
import { CrmMaturityController } from './crm-maturity.controller.js';
import { CrmMaturityService } from './crm-maturity.service.js';
import { CrmProvisioningService } from './crm-provisioning.service.js';
import { CrmReferenceService } from './crm-reference.service.js';
import { CrmSettingsService } from './crm-settings.service.js';
import { CrmScopeService } from './crm-scope.service.js';
import { EngagementService } from './engagement.service.js';
import { SalesService } from './sales.service.js';

@Module({
  controllers: [CrmController, CrmMaturityController],
  providers: [
    ContactsService,
    SalesService,
    EngagementService,
    CrmSettingsService,
    CrmProvisioningService,
    CrmReferenceService,
    CrmScopeService,
    CrmMaturityService,
  ],
  exports: [ContactsService, SalesService, EngagementService, CrmScopeService],
})
export class CrmModule {}
