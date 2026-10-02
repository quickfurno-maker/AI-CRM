import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Principal } from '../../platform/auth/auth.types.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { Public } from '../../platform/auth/public.decorator.js';
import { RequireEntitlement } from '../../platform/extensions/require-entitlement.decorator.js';
import { RequirePermission } from '../../platform/permissions/require-permission.decorator.js';
import {
  CreateApiKeyDto,
  CreateOauthClientDto,
  CreateWebhookEndpointDto,
  DeveloperListQueryDto,
  InstallMarketplaceExtensionDto,
  OauthClientCredentialsDto,
  UpdateWebhookEndpointDto,
} from './developer.dto.js';
import { DeveloperService } from './developer.service.js';

@Controller('developer')
export class DeveloperController {
  constructor(private readonly developer: DeveloperService) {}

  @Get('sdk')
  @RequirePermission('developer.read')
  sdk() {
    return this.developer.sdkContract();
  }

  @Get('api-keys')
  @RequireEntitlement('core.api')
  @RequirePermission('developer.read')
  apiKeys(@CurrentPrincipal() principal: Principal) {
    return this.developer.listApiKeys(principal);
  }

  @Post('api-keys')
  @RequireEntitlement('core.api')
  @RequirePermission('developer.manage')
  createApiKey(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.developer.createApiKey(principal, dto);
  }

  @Post('api-keys/:id/revoke')
  @RequireEntitlement('core.api')
  @RequirePermission('developer.manage')
  revokeApiKey(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.developer.revokeApiKey(principal, id);
  }

  @Get('oauth-clients')
  @RequireEntitlement('core.api')
  @RequirePermission('developer.read')
  oauthClients(@CurrentPrincipal() principal: Principal) {
    return this.developer.listOauthClients(principal);
  }

  @Post('oauth-clients')
  @RequireEntitlement('core.api')
  @RequirePermission('developer.manage')
  createOauthClient(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateOauthClientDto,
  ) {
    return this.developer.createOauthClient(principal, dto);
  }

  @Post('oauth-clients/:id/rotate-secret')
  @RequireEntitlement('core.api')
  @RequirePermission('developer.manage')
  rotateOauthClientSecret(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.developer.rotateOauthClientSecret(principal, id);
  }

  @Post('oauth-clients/:id/revoke')
  @RequireEntitlement('core.api')
  @RequirePermission('developer.manage')
  revokeOauthClient(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.developer.setOauthClientStatus(principal, id, 'REVOKED');
  }

  @Get('webhooks')
  @RequireEntitlement('core.api')
  @RequirePermission('developer.read')
  webhooks(@CurrentPrincipal() principal: Principal) {
    return this.developer.listWebhookEndpoints(principal);
  }

  @Post('webhooks')
  @RequireEntitlement('core.api')
  @RequirePermission('developer.manage')
  createWebhook(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateWebhookEndpointDto,
  ) {
    return this.developer.createWebhookEndpoint(principal, dto);
  }

  @Patch('webhooks/:id')
  @RequireEntitlement('core.api')
  @RequirePermission('developer.manage')
  updateWebhook(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookEndpointDto,
  ) {
    return this.developer.updateWebhookEndpoint(principal, id, dto);
  }

  @Post('webhooks/:id/rotate-secret')
  @RequireEntitlement('core.api')
  @RequirePermission('developer.manage')
  rotateWebhookSecret(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.developer.rotateWebhookSecret(principal, id);
  }

  @Get('webhook-deliveries')
  @RequireEntitlement('core.api')
  @RequirePermission('developer.read')
  webhookDeliveries(
    @CurrentPrincipal() principal: Principal,
    @Query() query: DeveloperListQueryDto,
  ) {
    return this.developer.listWebhookDeliveries(principal, query);
  }
}

@Controller('developer/oauth')
export class DeveloperOauthController {
  constructor(private readonly developer: DeveloperService) {}

  @Post('token')
  @Public()
  token(@Body() dto: OauthClientCredentialsDto) {
    return this.developer.issueClientCredentials(dto);
  }
}

@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly developer: DeveloperService) {}

  @Get()
  @RequirePermission('developer.read')
  catalog(@CurrentPrincipal() principal: Principal) {
    return this.developer.marketplaceCatalog(principal);
  }

  @Post(':id/install')
  @RequireEntitlement('marketplace.enabled')
  @RequirePermission('developer.manage')
  install(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InstallMarketplaceExtensionDto,
  ) {
    return this.developer.installMarketplaceExtension(principal, id, dto);
  }

  @Post(':id/uninstall')
  @RequireEntitlement('marketplace.enabled')
  @RequirePermission('developer.manage')
  uninstall(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.developer.uninstallMarketplaceExtension(principal, id);
  }
}
