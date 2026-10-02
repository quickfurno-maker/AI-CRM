import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Req,
  Res,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Principal } from '../../platform/auth/auth.types.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { Public } from '../../platform/auth/public.decorator.js';
import { RequireEntitlement } from '../../platform/extensions/require-entitlement.decorator.js';
import { RequirePermission } from '../../platform/permissions/require-permission.decorator.js';
import {
  CreateIdentityConnectionDto,
  CreateScimTokenDto,
  ExchangeOidcLoginDto,
  OidcCallbackQueryDto,
  ScimCreateUserDto,
  ScimPatchUserDto,
  StartOidcLoginQueryDto,
  UpdateEnterpriseSecurityPolicyDto,
} from './enterprise.dto.js';
import { EnterpriseService } from './enterprise.service.js';

@Controller('enterprise')
@RequireEntitlement('enterprise.controls')
export class EnterpriseController {
  constructor(private readonly enterprise: EnterpriseService) {}

  @Get('security-policy')
  @RequirePermission('enterprise.read')
  securityPolicy(@CurrentPrincipal() principal: Principal) {
    return this.enterprise.getSecurityPolicy(principal);
  }

  @Patch('security-policy')
  @RequirePermission('enterprise.manage')
  updateSecurityPolicy(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: UpdateEnterpriseSecurityPolicyDto,
  ) {
    return this.enterprise.updateSecurityPolicy(principal, dto);
  }

  @Get('identity-connections')
  @RequirePermission('enterprise.read')
  identityConnections(@CurrentPrincipal() principal: Principal) {
    return this.enterprise.listIdentityConnections(principal);
  }

  @Post('identity-connections')
  @RequirePermission('enterprise.manage')
  createIdentityConnection(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateIdentityConnectionDto,
  ) {
    return this.enterprise.createIdentityConnection(principal, dto);
  }

  @Post('identity-connections/:id/verify')
  @RequirePermission('enterprise.manage')
  verifyIdentityConnection(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.enterprise.verifyIdentityConnection(principal, id);
  }

  @Post('identity-connections/:id/disable')
  @RequirePermission('enterprise.manage')
  disableIdentityConnection(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.enterprise.disableIdentityConnection(principal, id);
  }

  @Get('scim-tokens')
  @RequirePermission('enterprise.read')
  scimTokens(@CurrentPrincipal() principal: Principal) {
    return this.enterprise.listScimTokens(principal);
  }

  @Post('scim-tokens')
  @RequirePermission('enterprise.manage')
  createScimToken(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateScimTokenDto,
  ) {
    return this.enterprise.createScimToken(principal, dto);
  }

  @Post('scim-tokens/:id/revoke')
  @RequirePermission('enterprise.manage')
  revokeScimToken(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.enterprise.revokeScimToken(principal, id);
  }
}

@Controller('enterprise/sso/oidc')
export class EnterpriseOidcController {
  constructor(private readonly enterprise: EnterpriseService) {}

  @Get(':connectionId/start')
  @Public()
  start(
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Query() query: StartOidcLoginQueryDto,
  ) {
    return this.enterprise.beginOidcLogin(connectionId, query.returnTo);
  }

  @Get('callback')
  @Public()
  async callback(
    @Query() query: OidcCallbackQueryDto,
    @Res() response: Response,
  ) {
    const redirectUrl = await this.enterprise.completeOidcCallback(query);
    return response.redirect(302, redirectUrl);
  }

  @Post('exchange')
  @Public()
  exchange(
    @Body() dto: ExchangeOidcLoginDto,
    @Req() request: Request,
  ) {
    return this.enterprise.exchangeOidcLogin(dto.code, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      requestId:
        typeof request.headers['x-request-id'] === 'string'
          ? request.headers['x-request-id']
          : undefined,
    });
  }
}

@Controller('scim/v2')
@Public()
export class ScimController {
  constructor(private readonly enterprise: EnterpriseService) {}

  @Get('ServiceProviderConfig')
  serviceProviderConfig() {
    return {
      schemas: [
        'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
      ],
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          type: 'oauthbearertoken',
          name: 'Bearer Token',
          description: 'CRM-AI organization SCIM bearer token.',
          specUri: 'https://www.rfc-editor.org/rfc/rfc6750',
          primary: true,
        },
      ],
    };
  }

  @Get('Users')
  async listUsers(
    @Headers('authorization') authorization: string | undefined,
    @Query('filter') filter?: string,
  ) {
    const identity = await this.enterprise.authenticateScimToken(
      this.bearer(authorization),
    );
    return this.enterprise.listScimUsers(identity, filter);
  }

  @Get('Users/:id')
  async getUser(
    @Headers('authorization') authorization: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const identity = await this.enterprise.authenticateScimToken(
      this.bearer(authorization),
    );
    return this.enterprise.getScimUser(identity, id);
  }

  @Post('Users')
  async createUser(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: ScimCreateUserDto,
  ) {
    const identity = await this.enterprise.authenticateScimToken(
      this.bearer(authorization),
    );
    return this.enterprise.createScimUser(identity, dto);
  }

  @Patch('Users/:id')
  async patchUser(
    @Headers('authorization') authorization: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScimPatchUserDto,
  ) {
    const identity = await this.enterprise.authenticateScimToken(
      this.bearer(authorization),
    );
    return this.enterprise.patchScimUser(identity, id, dto);
  }

  @Delete('Users/:id')
  @HttpCode(204)
  async deleteUser(
    @Headers('authorization') authorization: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const identity = await this.enterprise.authenticateScimToken(
      this.bearer(authorization),
    );
    await this.enterprise.deleteScimUser(identity, id);
  }

  private bearer(authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) return '';
    return authorization.slice(7);
  }
}
