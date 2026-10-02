import { Module } from '@nestjs/common';
import { CommunicationModule } from '../communication/communication.module.js';
import { AiController } from './ai.controller.js';
import { AiKnowledgeService } from './ai-knowledge.service.js';
import { AiManagementService } from './ai-management.service.js';
import { AiProviderGatewayService } from './ai-provider-gateway.service.js';
import { AiProvisioningService } from './ai-provisioning.service.js';
import { AiRuntimeService } from './ai-runtime.service.js';
import { AiToolGatewayService } from './ai-tool-gateway.service.js';
import { AiToolsBootstrapService } from './ai-tools.bootstrap.js';
import { AiWhatsappConsumerService } from './ai-whatsapp-consumer.service.js';
import { AiWhatsappService } from './ai-whatsapp.service.js';

@Module({
  imports: [CommunicationModule],
  controllers: [AiController],
  providers: [
    AiProvisioningService,
    AiProviderGatewayService,
    AiManagementService,
    AiKnowledgeService,
    AiToolGatewayService,
    AiRuntimeService,
    AiToolsBootstrapService,
    AiWhatsappService,
    AiWhatsappConsumerService,
  ],
  exports: [
    AiRuntimeService,
    AiToolGatewayService,
    AiKnowledgeService,
    AiWhatsappService,
  ],
})
export class AiModule {}
