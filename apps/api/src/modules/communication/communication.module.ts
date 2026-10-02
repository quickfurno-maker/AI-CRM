import { Module } from '@nestjs/common';
import { CommunicationController } from './communication.controller.js';
import { CommunicationService } from './communication.service.js';
import { CredentialResolverService } from './credential-resolver.service.js';
import { MetaPartnerService } from './meta-partner.service.js';
import { MetaTransportService } from './meta-transport.service.js';
import { MetaWebhookController } from './meta-webhook.controller.js';
import { MetaWebhookService } from './meta-webhook.service.js';

@Module({
  controllers: [CommunicationController, MetaWebhookController],
  providers: [
    CommunicationService,
    CredentialResolverService,
    MetaTransportService,
    MetaPartnerService,
    MetaWebhookService,
  ],
  exports: [CommunicationService],
})
export class CommunicationModule {}
