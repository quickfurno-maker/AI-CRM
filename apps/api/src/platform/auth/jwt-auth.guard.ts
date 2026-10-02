import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Request } from 'express';
import { DatabaseService } from '../database/database.service.js';
import {
  organizationMembers,
  sessions,
  users,
} from '../database/schema.js';
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
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) throw new UnauthorizedException('Missing access token.');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
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
    if (!session) throw new UnauthorizedException('Session is no longer valid.');

    request.principal = {
      userId: session.userId,
      organizationId: session.organizationId,
      membershipId: session.membershipId,
      sessionId: session.sessionId,
      isPlatformAdmin: session.isPlatformAdmin,
    };

    return true;
  }
}
