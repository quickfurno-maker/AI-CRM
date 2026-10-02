import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { CommunicationModule } from '../communication/communication.module.js';
import { CrmModule } from '../crm/crm.module.js';
import { AutomationActionService } from './automation-action.service.js';
import { AutomationController } from './automation.controller.js';
import { AutomationEventConsumerService } from './automation-event-consumer.service.js';
import { AutomationManagementService } from './automation-management.service.js';
import { AutomationRuntimeService } from './automation-runtime.service.js';
import { AutomationSchedulerService } from './automation-scheduler.service.js';

@Module({
  imports: [CrmModule, CommunicationModule, AiModule],
  controllers: [AutomationController],
  providers: [
    AutomationManagementService,
    AutomationActionService,
    AutomationRuntimeService,
    AutomationEventConsumerService,
    AutomationSchedulerService,
  ],
  exports: [AutomationRuntimeService],
})
export class AutomationModule {}
