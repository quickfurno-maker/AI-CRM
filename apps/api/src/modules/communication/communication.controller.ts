import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { Principal } from '../../platform/auth/auth.types.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { RequirePermission } from '../../platform/permissions/require-permission.decorator.js';
import { CommunicationService } from './communication.service.js';
import {
  BeginEmbeddedSignupDto,
  CompleteEmbeddedSignupDto,
  CreateCampaignDto,
  CreateChannelAccountDto,
  CreateTemplateDto,
  RegisterMetaPhoneDto,
  SendTemplateMessageDto,
  SendTextMessageDto,
  SetConsentDto,
  UpdateConversationDto,
} from './dto/communication.dto.js';
import { MetaPartnerService } from './meta-partner.service.js';

@Controller('communication')
export class CommunicationController {
  constructor(
    private readonly communication: CommunicationService,
    private readonly metaPartner: MetaPartnerService,
  ) {}

  @Get('meta/connections')
  @RequirePermission('communication.channel.manage')
  listMetaConnections(@CurrentPrincipal() principal: Principal) {
    return this.metaPartner.listConnections(principal);
  }

  @Post('meta/embedded-signup/begin')
  @RequirePermission('communication.channel.manage')
  beginMetaSignup(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: BeginEmbeddedSignupDto,
  ) {
    return this.metaPartner.begin(principal, dto);
  }

  @Post('meta/embedded-signup/complete')
  @RequirePermission('communication.channel.manage')
  completeMetaSignup(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CompleteEmbeddedSignupDto,
  ) {
    return this.metaPartner.complete(principal, dto);
  }

  @Post('meta/connections/:id/register-phone')
  @RequirePermission('communication.channel.manage')
  registerMetaPhone(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterMetaPhoneDto,
  ) {
    return this.metaPartner.registerPhoneForConnection(
      principal,
      id,
      dto.pin,
    );
  }

  @Post('meta/connections/:id/disconnect')
  @RequirePermission('communication.channel.manage')
  disconnectMeta(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.metaPartner.disconnect(principal, id);
  }

  @Get('channels')
  @RequirePermission('communication.channel.manage')
  listChannels(@CurrentPrincipal() principal: Principal) {
    return this.communication.listChannels(principal);
  }

  @Post('channels/manual')
  @RequirePermission('communication.channel.manage')
  createManualChannel(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateChannelAccountDto,
  ) {
    return this.communication.createChannel(principal, dto);
  }

  @Post('channels/:id/test')
  @RequirePermission('communication.channel.manage')
  testChannel(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.communication.testChannel(principal, id);
  }

  @Get('conversations')
  @RequirePermission('communication.inbox.read')
  listConversations(@CurrentPrincipal() principal: Principal) {
    return this.communication.listConversations(principal);
  }

  @Get('conversations/:id')
  @RequirePermission('communication.inbox.read')
  getConversation(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.communication.getConversation(principal, id);
  }

  @Get('conversations/:id/messages')
  @RequirePermission('communication.inbox.read')
  listMessages(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.communication.listMessages(principal, id);
  }

  @Patch('conversations/:id')
  @RequirePermission('communication.conversation.manage')
  updateConversation(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.communication.updateConversation(principal, id, dto);
  }

  @Post('conversations/:id/read')
  @RequirePermission('communication.inbox.read')
  markRead(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.communication.markConversationRead(principal, id);
  }

  @Post('conversations/:id/messages/text')
  @RequirePermission('communication.message.send')
  sendText(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendTextMessageDto,
  ) {
    return this.communication.sendText(principal, id, dto);
  }

  @Post('conversations/:id/messages/template')
  @RequirePermission('communication.message.send')
  sendTemplate(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendTemplateMessageDto,
  ) {
    return this.communication.sendTemplate(principal, id, dto);
  }

  @Get('templates')
  @RequirePermission('communication.template.manage')
  listTemplates(@CurrentPrincipal() principal: Principal) {
    return this.communication.listTemplates(principal);
  }

  @Post('templates')
  @RequirePermission('communication.template.manage')
  createTemplate(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.communication.createTemplate(principal, dto);
  }

  @Post('templates/:id/submit')
  @RequirePermission('communication.template.manage')
  submitTemplate(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.communication.submitTemplate(principal, id);
  }

  @Post('channels/:id/templates/sync')
  @RequirePermission('communication.template.manage')
  syncTemplates(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.communication.syncTemplates(principal, id);
  }

  @Post('contacts/:id/consent')
  @RequirePermission('communication.consent.manage')
  setConsent(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetConsentDto,
  ) {
    return this.communication.setConsent(principal, id, dto);
  }

  @Get('campaigns')
  @RequirePermission('communication.campaign.manage')
  listCampaigns(@CurrentPrincipal() principal: Principal) {
    return this.communication.listCampaigns(principal);
  }

  @Post('campaigns')
  @RequirePermission('communication.campaign.manage')
  createCampaign(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.communication.createCampaign(principal, dto);
  }

  @Post('campaigns/:id/queue')
  @RequirePermission('communication.campaign.manage')
  queueCampaign(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.communication.queueCampaign(principal, id);
  }
}
