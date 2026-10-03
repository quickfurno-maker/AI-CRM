import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { Principal } from '../../platform/auth/auth.types.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { RequirePermission } from '../../platform/permissions/require-permission.decorator.js';
import {
  AddSupportCommentDto,
  CreateGovernanceRequestDto,
  CreateSupportTicketDto,
  PlatformSearchQueryDto,
  ProviderUpdateSupportTicketDto,
  ReviewGovernanceRequestDto,
  UpdateSupportTicketDto,
  UpsertGovernancePolicyDto,
} from './platform-experience.dto.js';
import { PlatformExperienceService } from './platform-experience.service.js';

@Controller('platform')
export class PlatformExperienceController {
  constructor(private readonly experience: PlatformExperienceService) {}

  @Get('search')
  @RequirePermission('platform.search')
  search(
    @CurrentPrincipal() principal: Principal,
    @Query() query: PlatformSearchQueryDto,
  ) {
    return this.experience.search(principal, query.q, query.limit);
  }

  @Get('onboarding')
  @RequirePermission('onboarding.read')
  onboarding(@CurrentPrincipal() principal: Principal) {
    return this.experience.onboarding(principal);
  }

  @Post('onboarding/dismiss')
  @RequirePermission('onboarding.manage')
  dismiss(@CurrentPrincipal() principal: Principal) {
    return this.experience.setOnboardingDismissed(principal, true);
  }

  @Post('onboarding/reopen')
  @RequirePermission('onboarding.manage')
  reopen(@CurrentPrincipal() principal: Principal) {
    return this.experience.setOnboardingDismissed(principal, false);
  }

  @Get('notifications')
  @RequirePermission('notifications.read')
  notifications(
    @CurrentPrincipal() principal: Principal,
    @Query('limit') limit?: string,
  ) {
    return this.experience.listNotifications(
      principal,
      Number.parseInt(limit ?? '60', 10) || 60,
    );
  }

  @Post('notifications/:id/read')
  @RequirePermission('notifications.read')
  markRead(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.experience.markNotificationRead(principal, id);
  }

  @Post('notifications/read-all')
  @RequirePermission('notifications.read')
  markAllRead(@CurrentPrincipal() principal: Principal) {
    return this.experience.markAllNotificationsRead(principal);
  }

  @Get('support/tickets')
  @RequirePermission('support.read')
  tickets(@CurrentPrincipal() principal: Principal) {
    return this.experience.listSupportTickets(principal);
  }

  @Post('support/tickets')
  @RequirePermission('support.manage')
  createTicket(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateSupportTicketDto,
  ) {
    return this.experience.createSupportTicket(principal, dto);
  }

  @Get('support/tickets/:id')
  @RequirePermission('support.read')
  ticket(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.experience.supportTicket(principal, id);
  }

  @Post('support/tickets/:id/comments')
  @RequirePermission('support.manage')
  comment(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddSupportCommentDto,
  ) {
    return this.experience.addSupportComment(principal, id, dto.body);
  }

  @Patch('support/tickets/:id')
  @RequirePermission('support.manage')
  updateTicket(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupportTicketDto,
  ) {
    return this.experience.updateSupportTicket(principal, id, dto);
  }

  @Get('governance/policy')
  @RequirePermission('governance.read')
  governancePolicy(@CurrentPrincipal() principal: Principal) {
    return this.experience.governancePolicy(principal);
  }

  @Put('governance/policy')
  @RequirePermission('governance.manage')
  updateGovernancePolicy(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: UpsertGovernancePolicyDto,
  ) {
    return this.experience.updateGovernancePolicy(principal, dto);
  }

  @Get('governance/requests')
  @RequirePermission('governance.read')
  governanceRequests(@CurrentPrincipal() principal: Principal) {
    return this.experience.governanceRequests(principal);
  }

  @Post('governance/requests')
  @RequirePermission('governance.manage')
  createGovernanceRequest(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateGovernanceRequestDto,
  ) {
    return this.experience.createGovernanceRequest(principal, dto);
  }

  @Post('governance/requests/:id/cancel')
  @RequirePermission('governance.manage')
  cancelGovernanceRequest(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.experience.cancelGovernanceRequest(principal, id);
  }
}

@Controller('platform-admin/experience')
export class PlatformExperienceAdminController {
  constructor(private readonly experience: PlatformExperienceService) {}

  @Get('support/tickets')
  listTickets(@CurrentPrincipal() principal: Principal) {
    return this.experience.providerTickets(principal);
  }

  @Get('support/tickets/:id')
  ticket(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.experience.providerSupportTicket(principal, id);
  }

  @Post('support/tickets/:id/comments')
  comment(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddSupportCommentDto,
    @Query('internal') internal?: string,
  ) {
    return this.experience.providerAddSupportComment(
      principal,
      id,
      dto.body,
      internal === 'true',
    );
  }

  @Patch('support/tickets/:id')
  updateTicket(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProviderUpdateSupportTicketDto,
  ) {
    return this.experience.providerUpdateSupportTicket(principal, id, dto);
  }

  @Get('governance/requests')
  governanceRequests(@CurrentPrincipal() principal: Principal) {
    return this.experience.providerGovernanceRequests(principal);
  }

  @Post('governance/requests/:id/review')
  reviewGovernanceRequest(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewGovernanceRequestDto,
  ) {
    return this.experience.reviewGovernanceRequest(principal, id, dto);
  }
}
