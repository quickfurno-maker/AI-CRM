import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import {
  auditLogs,
  entitlements,
  memberRoles,
  organizationMembers,
  organizations,
  outboxEvents,
  permissions,
  planFeatures,
  plans,
  rolePermissions,
  roles,
  sessions,
  subscriptions,
  users,
  workspaces,
} from '../database/schema.js';
import { memberSeatAssignments } from '../../modules/staff/staff.schema.js';
import type { Principal } from './auth.types.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RefreshDto } from './dto/refresh.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

export type RequestMetadata = {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

@Injectable()
export class AuthService {
  private readonly refreshLifetimeMs = 30 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly database: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto, meta: RequestMetadata = {}) {
    const email = dto.email.trim().toLowerCase();
    const slug = dto.organizationSlug.trim().toLowerCase();
    const passwordHash = await hash(dto.password, 12);
    const refreshToken = this.createRefreshToken();
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const sessionExpiresAt = new Date(Date.now() + this.refreshLifetimeMs);
    const correlationId = randomUUID();

    const result = await this.database.db.transaction(async (tx) => {
      const existingUser = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (existingUser.length) {
        throw new ConflictException('An account with this email already exists.');
      }

      const existingOrg = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1);
      if (existingOrg.length) {
        throw new ConflictException('Organization slug is already in use.');
      }

      const [user] = await tx
        .insert(users)
        .values({
          email,
          passwordHash,
          displayName: dto.displayName.trim(),
        })
        .returning({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
        });

      const [organization] = await tx
        .insert(organizations)
        .values({
          name: dto.organizationName.trim(),
          slug,
        })
        .returning({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
        });

      const [membership] = await tx
        .insert(organizationMembers)
        .values({
          organizationId: organization.id,
          userId: user.id,
          isOwner: true,
        })
        .returning({ id: organizationMembers.id });

      await tx.insert(memberSeatAssignments).values({
        organizationId: organization.id,
        organizationMemberId: membership.id,
        accessClass: 'FULL',
        status: 'ACTIVE',
        assignedByMemberId: membership.id,
      });

      await tx.insert(workspaces).values({
        organizationId: organization.id,
        name: 'Main Workspace',
        slug: 'main',
      });

      const [ownerRole] = await tx
        .insert(roles)
        .values({
          organizationId: organization.id,
          key: 'owner',
          name: 'Owner',
          description: 'Full organization access.',
          isSystem: true,
        })
        .returning({ id: roles.id });

      const permissionRows = await tx
        .select({ id: permissions.id })
        .from(permissions);

      if (permissionRows.length) {
        await tx.insert(rolePermissions).values(
          permissionRows.map((permission) => ({
            roleId: ownerRole.id,
            permissionId: permission.id,
            scope: 'ORGANIZATION',
          })),
        );
      }

      await tx.insert(memberRoles).values({
        organizationId: organization.id,
        organizationMemberId: membership.id,
        roleId: ownerRole.id,
      });

      const starterPlans = await tx
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.key, 'starter'))
        .limit(1);
      const starterPlan = starterPlans[0];
      if (!starterPlan) {
        throw new InternalServerErrorException(
          'Starter plan has not been initialized.',
        );
      }

      await tx.insert(subscriptions).values({
        organizationId: organization.id,
        planId: starterPlan.id,
        status: 'TRIALING',
        billingCycle: 'MONTHLY',
        currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      });

      const starterFeatures = await tx
        .select({
          key: planFeatures.featureKey,
          enabled: planFeatures.enabled,
          limitValue: planFeatures.limitValue,
          config: planFeatures.config,
        })
        .from(planFeatures)
        .where(eq(planFeatures.planId, starterPlan.id));

      if (starterFeatures.length) {
        await tx.insert(entitlements).values(
          starterFeatures.map((feature) => ({
            organizationId: organization.id,
            key: feature.key,
            enabled: feature.enabled,
            limitValue: feature.limitValue,
            config: feature.config,
            source: 'PLAN',
          })),
        );
      }

      const [session] = await tx
        .insert(sessions)
        .values({
          userId: user.id,
          organizationId: organization.id,
          organizationMemberId: membership.id,
          refreshTokenHash,
          userAgent: meta.userAgent,
          ipAddress: meta.ipAddress,
          expiresAt: sessionExpiresAt,
        })
        .returning({ id: sessions.id });

      await tx.insert(outboxEvents).values({
        organizationId: organization.id,
        eventType: 'identity.organization.created.v1',
        aggregateType: 'organization',
        aggregateId: organization.id,
        correlationId,
        payload: {
          organizationId: organization.id,
          ownerUserId: user.id,
          source: 'self_signup',
        },
      });

      await tx.insert(auditLogs).values({
        organizationId: organization.id,
        actorType: 'USER',
        actorId: user.id,
        action: 'identity.organization.register',
        resourceType: 'organization',
        resourceId: organization.id,
        requestId: meta.requestId,
        after: {
          organizationName: organization.name,
          organizationSlug: organization.slug,
        },
      });

      return {
        user,
        organization,
        membershipId: membership.id,
        sessionId: session.id,
      };
    });

    return {
      user: result.user,
      organization: result.organization,
      tokens: await this.issueTokens(
        {
          userId: result.user.id,
          organizationId: result.organization.id,
          membershipId: result.membershipId,
          sessionId: result.sessionId,
          isPlatformAdmin: false,
        },
        refreshToken,
      ),
    };
  }

  async login(dto: LoginDto, meta: RequestMetadata = {}) {
    const email = dto.email.trim().toLowerCase();
    const slug = dto.organizationSlug.trim().toLowerCase();

    const rows = await this.database.db
      .select({
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        passwordHash: users.passwordHash,
        isPlatformAdmin: users.isPlatformAdmin,
        organizationId: organizations.id,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
        membershipId: organizationMembers.id,
      })
      .from(users)
      .innerJoin(
        organizationMembers,
        eq(organizationMembers.userId, users.id),
      )
      .innerJoin(
        organizations,
        eq(organizations.id, organizationMembers.organizationId),
      )
      .where(
        and(
          eq(users.email, email),
          eq(organizations.slug, slug),
          eq(organizations.status, 'ACTIVE'),
          eq(organizationMembers.status, 'ACTIVE'),
        ),
      )
      .limit(1);

    const account = rows[0];
    if (
      !account?.passwordHash ||
      !(await compare(dto.password, account.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const refreshToken = this.createRefreshToken();
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const [session] = await this.database.db
      .insert(sessions)
      .values({
        userId: account.userId,
        organizationId: account.organizationId,
        organizationMemberId: account.membershipId,
        refreshTokenHash,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        expiresAt: new Date(Date.now() + this.refreshLifetimeMs),
      })
      .returning({ id: sessions.id });

    await this.database.db.insert(auditLogs).values({
      organizationId: account.organizationId,
      actorType: 'USER',
      actorId: account.userId,
      action: 'identity.session.login',
      resourceType: 'session',
      resourceId: session.id,
      requestId: meta.requestId,
    });

    return {
      user: {
        id: account.userId,
        email: account.email,
        displayName: account.displayName,
      },
      organization: {
        id: account.organizationId,
        name: account.organizationName,
        slug: account.organizationSlug,
      },
      tokens: await this.issueTokens(
        {
          userId: account.userId,
          organizationId: account.organizationId,
          membershipId: account.membershipId,
          sessionId: session.id,
          isPlatformAdmin: account.isPlatformAdmin,
        },
        refreshToken,
      ),
    };
  }

  async refresh(dto: RefreshDto) {
    const tokenHash = this.hashRefreshToken(dto.refreshToken);
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
          eq(sessions.refreshTokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
          eq(organizationMembers.status, 'ACTIVE'),
        ),
      )
      .limit(1);

    const session = rows[0];
    if (!session) throw new UnauthorizedException('Invalid refresh token.');

    const newRefreshToken = this.createRefreshToken();
    await this.database.db
      .update(sessions)
      .set({
        refreshTokenHash: this.hashRefreshToken(newRefreshToken),
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, session.sessionId));

    return this.issueTokens(
      {
        userId: session.userId,
        organizationId: session.organizationId,
        membershipId: session.membershipId,
        sessionId: session.sessionId,
        isPlatformAdmin: session.isPlatformAdmin,
      },
      newRefreshToken,
    );
  }

  async createFederatedSession(
    account: {
      userId: string;
      organizationId: string;
      membershipId: string;
      isPlatformAdmin: boolean;
    },
    meta: RequestMetadata = {},
  ) {
    const refreshToken = this.createRefreshToken();
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const [session] = await this.database.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(sessions)
        .values({
          userId: account.userId,
          organizationId: account.organizationId,
          organizationMemberId: account.membershipId,
          refreshTokenHash,
          userAgent: meta.userAgent,
          ipAddress: meta.ipAddress,
          expiresAt: new Date(Date.now() + this.refreshLifetimeMs),
        })
        .returning({ id: sessions.id });

      await tx.insert(auditLogs).values({
        organizationId: account.organizationId,
        actorType: 'USER',
        actorId: account.userId,
        action: 'identity.session.sso_login',
        resourceType: 'session',
        resourceId: created.id,
        requestId: meta.requestId,
      });
      return [created];
    });

    const principal: Principal = {
      userId: account.userId,
      organizationId: account.organizationId,
      membershipId: account.membershipId,
      sessionId: session.id,
      isPlatformAdmin: account.isPlatformAdmin,
      authType: 'SESSION',
    };

    return {
      sessionId: session.id,
      tokens: await this.issueTokens(principal, refreshToken),
    };
  }

  async logout(principal: Principal) {
    await this.database.db
      .update(sessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(sessions.id, principal.sessionId));

    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      actorType: 'USER',
      actorId: principal.userId,
      action: 'identity.session.logout',
      resourceType: 'session',
      resourceId: principal.sessionId,
    });

    return { success: true };
  }

  private async issueTokens(principal: Principal, refreshToken: string) {
    const expiresIn = this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
    const accessToken = await this.jwt.signAsync(
      {
        sub: principal.userId,
        org: principal.organizationId,
        membership: principal.membershipId,
        sid: principal.sessionId,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn,
      },
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn,
    };
  }

  private createRefreshToken() {
    return randomBytes(48).toString('base64url');
  }

  private hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
