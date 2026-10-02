import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { Request } from 'express';
import {
  developerOauthClients,
  developerOauthTokens,
} from '../../modules/developer/developer.schema.js';
import { hashCredential } from '../../modules/developer/developer-credentials.js';
import { DatabaseService } from '../database/database.service.js';
import {
  apiKeys,
  organizationMembers,
  sessions,
  users,
} from '../database/schema.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { REQUIRED_PERMISSION_KEY } from '../permissions/require-permission.decorator.js';
import type { AccessTokenPayload, Principal } from './auth.types.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

type RequestWithPrincipal = Request & { principal?: Principal };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const header = request.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const xApiKey = request.headers['x-api-key'];
    const apiKey =
      typeof xApiKey === 'string'
        ? xApiKey
        : Array.isArray(xApiKey)
          ? xApiKey[0]
          : undefined;

    const externalToken =
      apiKey ??
      (bearer?.startsWith('crmkey_') || bearer?.startsWith('crmoauth_')
        ? bearer
        : undefined);

    if (externalToken) {
      const requiredPermission = this.reflector.getAllAndOverride<string>(
        REQUIRED_PERMISSION_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!requiredPermission) {
        throw new ForbiddenException(
          'External credentials can access only explicitly scoped API routes.',
        );
      }

      request.principal = externalToken.startsWith('crmkey_')
        ? await this.authenticateApiKey(externalToken)
        : await this.authenticateOauthToken(externalToken);
      return true;
    }

    if (!bearer) {
      throw new UnauthorizedException('Missing access token.');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(bearer, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    const rows = await this.database.db
      .select({
        sessionId: sessions.id,
        userId: sessions.userId,
        organizationId: sessions.organizationId,
        membershipId: sessions.organizationMemberId,
        isPlatformAdmin: users.isPlatformAdmin,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(
        organizationMembers,
        eq(organizationMembers.id, sessions.organizationMemberId),
      )
      .where(
        and(
          eq(sessions.id, payload.sid),
          eq(sessions.userId, payload.sub),
          eq(sessions.organizationId, payload.org),
          eq(sessions.organizationMemberId, payload.membership),
          eq(organizationMembers.status, 'ACTIVE'),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    const session = rows[0];
    if (!session) {
      throw new UnauthorizedException('Session is no longer valid.');
    }

    request.principal = {
      userId: session.userId,
      organizationId: session.organizationId,
      membershipId: session.membershipId,
      sessionId: session.sessionId,
      isPlatformAdmin: session.isPlatformAdmin,
      authType: 'SESSION',
    };

    return true;
  }

  private async authenticateApiKey(secret: string): Promise<Principal> {
    const now = new Date();
    const rows = await this.database.db
      .select({
        id: apiKeys.id,
        organizationId: apiKeys.organizationId,
        scopes: apiKeys.scopes,
        membershipId: apiKeys.createdByMemberId,
        userId: organizationMembers.userId,
      })
      .from(apiKeys)
      .innerJoin(
        organizationMembers,
        eq(organizationMembers.id, apiKeys.createdByMemberId),
      )
      .where(
        and(
          eq(apiKeys.keyHash, hashCredential(secret)),
          eq(organizationMembers.status, 'ACTIVE'),
          isNull(apiKeys.revokedAt),
          or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
        ),
      )
      .limit(1);
    const key = rows[0];
    if (!key || !key.membershipId) {
      throw new UnauthorizedException('Invalid or expired API key.');
    }
    if (!(await this.entitlements.can(key.organizationId, 'core.api'))) {
      throw new UnauthorizedException('API access is not enabled.');
    }

    await this.database.db
      .update(apiKeys)
      .set({ lastUsedAt: now })
      .where(eq(apiKeys.id, key.id));

    return {
      userId: key.userId,
      organizationId: key.organizationId,
      membershipId: key.membershipId,
      sessionId: key.id,
      isPlatformAdmin: false,
      actorType: 'API',
      actorId: key.id,
      authType: 'API_KEY',
      authScopes: key.scopes,
    };
  }

  private async authenticateOauthToken(secret: string): Promise<Principal> {
    const now = new Date();
    const rows = await this.database.db
      .select({
        tokenId: developerOauthTokens.id,
        organizationId: developerOauthTokens.organizationId,
        scopes: developerOauthTokens.scopes,
        clientRecordId: developerOauthClients.id,
        membershipId: developerOauthClients.createdByMemberId,
        userId: organizationMembers.userId,
      })
      .from(developerOauthTokens)
      .innerJoin(
        developerOauthClients,
        eq(developerOauthClients.id, developerOauthTokens.clientId),
      )
      .innerJoin(
        organizationMembers,
        eq(
          organizationMembers.id,
          developerOauthClients.createdByMemberId,
        ),
      )
      .where(
        and(
          eq(developerOauthTokens.tokenHash, hashCredential(secret)),
          isNull(developerOauthTokens.revokedAt),
          gt(developerOauthTokens.expiresAt, now),
          eq(developerOauthClients.status, 'ACTIVE'),
          eq(organizationMembers.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    const token = rows[0];
    if (!token || !token.membershipId) {
      throw new UnauthorizedException('Invalid or expired OAuth token.');
    }
    if (!(await this.entitlements.can(token.organizationId, 'core.api'))) {
      throw new UnauthorizedException('API access is not enabled.');
    }

    await this.database.db.transaction(async (tx) => {
      await tx
        .update(developerOauthTokens)
        .set({ lastUsedAt: now })
        .where(eq(developerOauthTokens.id, token.tokenId));
      await tx
        .update(developerOauthClients)
        .set({ lastUsedAt: now, updatedAt: now })
        .where(eq(developerOauthClients.id, token.clientRecordId));
    });

    return {
      userId: token.userId,
      organizationId: token.organizationId,
      membershipId: token.membershipId,
      sessionId: token.tokenId,
      isPlatformAdmin: false,
      actorType: 'INTEGRATION',
      actorId: token.clientRecordId,
      authType: 'OAUTH',
      authScopes: token.scopes,
    };
  }
}
