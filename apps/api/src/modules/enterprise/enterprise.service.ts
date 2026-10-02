import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { AuthService, type RequestMetadata } from '../../platform/auth/auth.service.js';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  auditLogs,
  organizationMembers,
  organizations,
  outboxEvents,
  sessions,
  users,
} from '../../platform/database/schema.js';
import { EntitlementsService } from '../../platform/entitlements/entitlements.service.js';
import { SecretCipherService } from '../../platform/security/secret-cipher.service.js';
import {
  generateCredential,
  hashCredential,
} from '../developer/developer-credentials.js';
import {
  CreateIdentityConnectionDto,
  CreateScimTokenDto,
  OidcCallbackQueryDto,
  ScimCreateUserDto,
  ScimPatchUserDto,
  UpdateEnterpriseSecurityPolicyDto,
} from './enterprise.dto.js';
import {
  enterpriseIdentityConnections,
  enterpriseIdentityLinks,
  enterpriseOidcStates,
  enterpriseScimTokens,
  enterpriseSecurityPolicies,
  enterpriseSsoLoginCodes,
} from './enterprise.schema.js';
import { validateIpRule } from './enterprise-ip.js';

type ScimIdentity = {
  organizationId: string;
  tokenId: string;
};

const blockedExternalNetworks = new BlockList();
blockedExternalNetworks.addSubnet('10.0.0.0', 8, 'ipv4');
blockedExternalNetworks.addSubnet('172.16.0.0', 12, 'ipv4');
blockedExternalNetworks.addSubnet('192.168.0.0', 16, 'ipv4');
blockedExternalNetworks.addSubnet('127.0.0.0', 8, 'ipv4');
blockedExternalNetworks.addSubnet('169.254.0.0', 16, 'ipv4');
blockedExternalNetworks.addSubnet('0.0.0.0', 8, 'ipv4');
blockedExternalNetworks.addSubnet('224.0.0.0', 4, 'ipv4');
blockedExternalNetworks.addSubnet('::1', 128, 'ipv6');
blockedExternalNetworks.addSubnet('fc00::', 7, 'ipv6');
blockedExternalNetworks.addSubnet('fe80::', 10, 'ipv6');

@Injectable()
export class EnterpriseService {
  constructor(
    private readonly database: DatabaseService,
    private readonly entitlements: EntitlementsService,
    private readonly secrets: SecretCipherService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {}

  async getSecurityPolicy(principal: Principal) {
    await this.assertEnterpriseEnabled(principal.organizationId);
    return this.getOrCreatePolicy(principal.organizationId);
  }

  async updateSecurityPolicy(
    principal: Principal,
    dto: UpdateEnterpriseSecurityPolicyDto,
  ) {
    await this.assertEnterpriseEnabled(principal.organizationId);
    const before = await this.getOrCreatePolicy(principal.organizationId);
    const ipAllowlist =
      dto.ipAllowlist?.map((rule) => {
        try {
          return validateIpRule(rule);
        } catch (error) {
          throw new BadRequestException(
            error instanceof Error ? error.message : 'Invalid IP allowlist.',
          );
        }
      }) ?? before.ipAllowlist;
    const enforce = dto.enforceIpAllowlist ?? before.enforceIpAllowlist;
    if (enforce && !ipAllowlist.length) {
      throw new BadRequestException(
        'IP allowlist enforcement requires at least one IP or CIDR rule.',
      );
    }
    const allowedEmailDomains =
      dto.allowedEmailDomains?.map((domain) =>
        this.normalizeDomain(domain),
      ) ?? before.allowedEmailDomains;

    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(enterpriseSecurityPolicies)
        .set({
          enforceIpAllowlist: enforce,
          ipAllowlist,
          allowedEmailDomains,
          sessionMaxMinutes:
            dto.sessionMaxMinutes ?? before.sessionMaxMinutes,
          auditRetentionDays:
            dto.auditRetentionDays ?? before.auditRetentionDays,
          config: dto.config ?? before.config,
          updatedAt: new Date(),
        })
        .where(
          eq(
            enterpriseSecurityPolicies.organizationId,
            principal.organizationId,
          ),
        )
        .returning();
      if (!row) {
        throw new NotFoundException(
          'Enterprise security policy was not initialized.',
        );
      }

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'enterprise.security_policy.update',
        resourceType: 'enterprise_security_policy',
        resourceId: row.id,
        before,
        after: row,
      });
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'enterprise.security_policy.updated.v1',
        aggregateType: 'enterprise_security_policy',
        aggregateId: row.id,
        payload: {
          policyId: row.id,
          enforceIpAllowlist: row.enforceIpAllowlist,
          sessionMaxMinutes: row.sessionMaxMinutes,
          auditRetentionDays: row.auditRetentionDays,
        },
      });
      return row;
    });
  }

  async listIdentityConnections(principal: Principal) {
    await this.assertEnterpriseEnabled(principal.organizationId);
    return this.database.db
      .select({
        id: enterpriseIdentityConnections.id,
        providerType: enterpriseIdentityConnections.providerType,
        name: enterpriseIdentityConnections.name,
        issuerUrl: enterpriseIdentityConnections.issuerUrl,
        clientId: enterpriseIdentityConnections.clientId,
        domains: enterpriseIdentityConnections.domains,
        status: enterpriseIdentityConnections.status,
        metadata: enterpriseIdentityConnections.metadata,
        lastVerifiedAt: enterpriseIdentityConnections.lastVerifiedAt,
        createdAt: enterpriseIdentityConnections.createdAt,
        updatedAt: enterpriseIdentityConnections.updatedAt,
      })
      .from(enterpriseIdentityConnections)
      .where(
        eq(
          enterpriseIdentityConnections.organizationId,
          principal.organizationId,
        ),
      )
      .orderBy(desc(enterpriseIdentityConnections.createdAt));
  }

  async createIdentityConnection(
    principal: Principal,
    dto: CreateIdentityConnectionDto,
  ) {
    await this.assertEnterpriseEnabled(principal.organizationId);
    this.assertExternalIssuerUrl(dto.issuerUrl);
    const domains = (dto.domains ?? []).map((domain) =>
      this.normalizeDomain(domain),
    );
    const [row] = await this.database.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(enterpriseIdentityConnections)
        .values({
          organizationId: principal.organizationId,
          createdByMemberId: principal.membershipId,
          providerType: dto.providerType ?? 'OIDC',
          name: dto.name.trim(),
          issuerUrl: dto.issuerUrl.replace(/\/$/, ''),
          clientId: dto.clientId.trim(),
          clientSecretCiphertext: this.secrets.encrypt(dto.clientSecret),
          domains,
          status: 'DRAFT',
        })
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'enterprise.identity_connection.create',
        resourceType: 'identity_connection',
        resourceId: created.id,
        after: {
          providerType: created.providerType,
          name: created.name,
          issuerUrl: created.issuerUrl,
          clientId: created.clientId,
          domains: created.domains,
          status: created.status,
        },
      });
      return [created];
    });

    return {
      id: row.id,
      providerType: row.providerType,
      name: row.name,
      issuerUrl: row.issuerUrl,
      clientId: row.clientId,
      domains: row.domains,
      status: row.status,
      createdAt: row.createdAt,
    };
  }

  async verifyIdentityConnection(principal: Principal, id: string) {
    await this.assertEnterpriseEnabled(principal.organizationId);
    const connection = await this.getIdentityConnection(
      principal.organizationId,
      id,
    );
    await this.assertSafeExternalUrl(
      connection.issuerUrl,
      'OIDC issuer',
    );
    const discoveryUrl =
      connection.issuerUrl.replace(/\/$/, '') +
      '/.well-known/openid-configuration';

    let metadata: Record<string, unknown>;
    try {
      const response = await fetch(discoveryUrl, {
        signal: AbortSignal.timeout(8000),
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(
          `OIDC discovery returned HTTP ${response.status}.`,
        );
      }
      metadata = (await response.json()) as Record<string, unknown>;
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? `OIDC discovery verification failed: ${error.message}`
          : 'OIDC discovery verification failed.',
      );
    }

    const issuer =
      typeof metadata.issuer === 'string'
        ? metadata.issuer.replace(/\/$/, '')
        : '';
    const required = [
      'authorization_endpoint',
      'token_endpoint',
      'userinfo_endpoint',
      'jwks_uri',
    ];
    if (
      issuer !== connection.issuerUrl.replace(/\/$/, '') ||
      required.some((key) => typeof metadata[key] !== 'string')
    ) {
      throw new BadRequestException(
        'OIDC discovery metadata is incomplete or issuer does not match.',
      );
    }

    await Promise.all([
      this.assertSafeExternalUrl(
        String(metadata.token_endpoint),
        'OIDC token endpoint',
      ),
      this.assertSafeExternalUrl(
        String(metadata.userinfo_endpoint),
        'OIDC userinfo endpoint',
      ),
    ]);

    const safeMetadata = {
      issuer: metadata.issuer,
      authorization_endpoint: metadata.authorization_endpoint,
      token_endpoint: metadata.token_endpoint,
      userinfo_endpoint: metadata.userinfo_endpoint,
      jwks_uri: metadata.jwks_uri,
      end_session_endpoint: metadata.end_session_endpoint,
      scopes_supported: metadata.scopes_supported,
      claims_supported: metadata.claims_supported,
      token_endpoint_auth_methods_supported:
        metadata.token_endpoint_auth_methods_supported,
    };

    const [row] = await this.database.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(enterpriseIdentityConnections)
        .set({
          status: 'ACTIVE',
          metadata: safeMetadata,
          lastVerifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(enterpriseIdentityConnections.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'enterprise.identity_connection.verify',
        resourceType: 'identity_connection',
        resourceId: id,
        after: {
          status: updated.status,
          lastVerifiedAt: updated.lastVerifiedAt,
          metadata: safeMetadata,
        },
      });
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'enterprise.identity_connection.verified.v1',
        aggregateType: 'identity_connection',
        aggregateId: id,
        payload: { identityConnectionId: id, providerType: updated.providerType },
      });
      return [updated];
    });
    return {
      id: row.id,
      status: row.status,
      lastVerifiedAt: row.lastVerifiedAt,
      metadata: row.metadata,
    };
  }

  async beginOidcLogin(
    connectionId: string,
    returnTo = '/dashboard',
  ) {
    const connection = await this.getActiveIdentityConnection(connectionId);
    await this.assertEnterpriseEnabled(connection.organizationId);

    const metadata = this.oidcMetadata(connection.metadata);
    const safeReturnTo = this.sanitizeReturnTo(returnTo);
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(64).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.database.db.insert(enterpriseOidcStates).values({
      organizationId: connection.organizationId,
      connectionId: connection.id,
      stateHash: hashCredential(state),
      codeVerifierCiphertext: this.secrets.encrypt(codeVerifier),
      returnTo: safeReturnTo,
      expiresAt,
    });

    const authorizationUrl = new URL(metadata.authorizationEndpoint);
    authorizationUrl.searchParams.set('client_id', connection.clientId);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('redirect_uri', this.oidcCallbackUrl());
    authorizationUrl.searchParams.set('scope', 'openid email profile');
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');

    return {
      authorizationUrl: authorizationUrl.toString(),
      expiresIn: 600,
    };
  }

  async completeOidcCallback(query: OidcCallbackQueryDto) {
    if (query.error) {
      throw new UnauthorizedException(
        `OIDC provider rejected login: ${query.error_description ?? query.error}.`,
      );
    }
    if (!query.state || !query.code) {
      throw new UnauthorizedException(
        'OIDC callback is missing state or authorization code.',
      );
    }

    const now = new Date();
    const [state] = await this.database.db
      .update(enterpriseOidcStates)
      .set({ usedAt: now })
      .where(
        and(
          eq(enterpriseOidcStates.stateHash, hashCredential(query.state)),
          isNull(enterpriseOidcStates.usedAt),
          gt(enterpriseOidcStates.expiresAt, now),
        ),
      )
      .returning();
    if (!state) {
      throw new UnauthorizedException('OIDC state is invalid, expired or used.');
    }

    const connection = await this.getActiveIdentityConnection(
      state.connectionId,
    );
    if (connection.organizationId !== state.organizationId) {
      throw new UnauthorizedException('OIDC tenant context mismatch.');
    }
    await this.assertEnterpriseEnabled(connection.organizationId);

    const metadata = this.oidcMetadata(connection.metadata);
    await Promise.all([
      this.assertSafeExternalUrl(
        metadata.tokenEndpoint,
        'OIDC token endpoint',
      ),
      this.assertSafeExternalUrl(
        metadata.userinfoEndpoint,
        'OIDC userinfo endpoint',
      ),
    ]);

    const clientSecret = this.secrets.decrypt(
      connection.clientSecretCiphertext,
    );
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: query.code,
      redirect_uri: this.oidcCallbackUrl(),
      client_id: connection.clientId,
      code_verifier: this.secrets.decrypt(state.codeVerifierCiphertext),
    });
    const tokenHeaders: Record<string, string> = {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    };

    if (
      metadata.tokenEndpointAuthMethods.includes('client_secret_basic')
    ) {
      tokenHeaders.authorization =
        'Basic ' +
        Buffer.from(
          connection.clientId + ':' + clientSecret,
          'utf8',
        ).toString('base64');
    } else {
      tokenBody.set('client_secret', clientSecret);
    }

    let accessToken: string;
    try {
      const response = await fetch(metadata.tokenEndpoint, {
        method: 'POST',
        headers: tokenHeaders,
        body: tokenBody,
        signal: AbortSignal.timeout(10000),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || typeof payload.access_token !== 'string') {
        throw new Error(
          typeof payload.error_description === 'string'
            ? payload.error_description
            : `OIDC token endpoint returned HTTP ${response.status}.`,
        );
      }
      accessToken = payload.access_token;
    } catch (error) {
      throw new UnauthorizedException(
        error instanceof Error
          ? `OIDC token exchange failed: ${error.message}`
          : 'OIDC token exchange failed.',
      );
    }

    let userinfo: Record<string, unknown>;
    try {
      const response = await fetch(metadata.userinfoEndpoint, {
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        throw new Error(
          `OIDC userinfo endpoint returned HTTP ${response.status}.`,
        );
      }
      userinfo = (await response.json()) as Record<string, unknown>;
    } catch (error) {
      throw new UnauthorizedException(
        error instanceof Error
          ? `OIDC userinfo lookup failed: ${error.message}`
          : 'OIDC userinfo lookup failed.',
      );
    }

    const subject =
      typeof userinfo.sub === 'string' ? userinfo.sub.trim() : '';
    const email =
      typeof userinfo.email === 'string'
        ? userinfo.email.trim().toLowerCase()
        : '';
    if (!subject || !email) {
      throw new UnauthorizedException(
        'OIDC userinfo must include subject and email.',
      );
    }
    if (userinfo.email_verified === false) {
      throw new UnauthorizedException(
        'OIDC account email has not been verified.',
      );
    }

    if (connection.domains.length) {
      const domain = email.split('@')[1]?.toLowerCase();
      if (!domain || !connection.domains.includes(domain)) {
        throw new ForbiddenException(
          'OIDC account email domain is not allowed for this connection.',
        );
      }
    }
    await this.assertEmailAllowed(connection.organizationId, email);

    const identity = await this.resolveOidcIdentity(
      connection.id,
      connection.organizationId,
      subject,
      email,
    );

    const handoff = generateCredential('sso', 40);
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
    await this.database.db.transaction(async (tx) => {
      await tx.insert(enterpriseSsoLoginCodes).values({
        organizationId: connection.organizationId,
        userId: identity.userId,
        membershipId: identity.membershipId,
        connectionId: connection.id,
        codeHash: handoff.hash,
        returnTo: state.returnTo,
        expiresAt,
      });
      await tx
        .update(enterpriseIdentityLinks)
        .set({
          email,
          lastLoginAt: now,
          updatedAt: now,
        })
        .where(eq(enterpriseIdentityLinks.id, identity.linkId));
      await tx.insert(auditLogs).values({
        organizationId: connection.organizationId,
        actorType: 'USER',
        actorId: identity.userId,
        action: 'enterprise.sso.identity_authenticated',
        resourceType: 'identity_connection',
        resourceId: connection.id,
        metadata: {
          subject,
          email,
          membershipId: identity.membershipId,
        },
      });
      await tx.insert(outboxEvents).values({
        organizationId: connection.organizationId,
        eventType: 'enterprise.sso.identity_authenticated.v1',
        aggregateType: 'identity_connection',
        aggregateId: connection.id,
        payload: {
          identityConnectionId: connection.id,
          userId: identity.userId,
          membershipId: identity.membershipId,
        },
      });
    });

    const redirect = new URL(
      '/sso/callback',
      this.config.getOrThrow<string>('WEB_APP_ORIGIN'),
    );
    redirect.searchParams.set('code', handoff.secret);
    return redirect.toString();
  }

  async exchangeOidcLogin(
    secret: string,
    meta: RequestMetadata = {},
  ) {
    const now = new Date();
    const [claim] = await this.database.db
      .update(enterpriseSsoLoginCodes)
      .set({ usedAt: now })
      .where(
        and(
          eq(enterpriseSsoLoginCodes.codeHash, hashCredential(secret)),
          isNull(enterpriseSsoLoginCodes.usedAt),
          gt(enterpriseSsoLoginCodes.expiresAt, now),
        ),
      )
      .returning();
    if (!claim) {
      throw new UnauthorizedException(
        'SSO login code is invalid, expired or already used.',
      );
    }

    await this.assertEnterpriseEnabled(claim.organizationId);
    const rows = await this.database.db
      .select({
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        isPlatformAdmin: users.isPlatformAdmin,
        membershipId: organizationMembers.id,
        organizationId: organizations.id,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .innerJoin(
        organizations,
        eq(organizations.id, organizationMembers.organizationId),
      )
      .where(
        and(
          eq(organizationMembers.id, claim.membershipId),
          eq(organizationMembers.organizationId, claim.organizationId),
          eq(organizationMembers.userId, claim.userId),
          eq(organizationMembers.status, 'ACTIVE'),
          eq(organizations.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    const account = rows[0];
    if (!account) {
      throw new UnauthorizedException(
        'SSO account is no longer active in this organization.',
      );
    }

    const session = await this.auth.createFederatedSession(
      {
        userId: account.userId,
        organizationId: account.organizationId,
        membershipId: account.membershipId,
        isPlatformAdmin: account.isPlatformAdmin,
      },
      meta,
    );

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
      tokens: session.tokens,
      returnTo: this.sanitizeReturnTo(claim.returnTo),
    };
  }

  async disableIdentityConnection(principal: Principal, id: string) {
    await this.assertEnterpriseEnabled(principal.organizationId);
    const before = await this.getIdentityConnection(
      principal.organizationId,
      id,
    );
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(enterpriseIdentityConnections)
        .set({ status: 'DISABLED', updatedAt: new Date() })
        .where(
          and(
            eq(
              enterpriseIdentityConnections.organizationId,
              principal.organizationId,
            ),
            eq(enterpriseIdentityConnections.id, id),
          ),
        )
        .returning();
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'enterprise.identity_connection.disable',
        resourceType: 'identity_connection',
        resourceId: id,
        before: { status: before.status },
        after: { status: row.status },
      });
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'enterprise.identity_connection.disabled.v1',
        aggregateType: 'identity_connection',
        aggregateId: id,
        payload: { identityConnectionId: id },
      });
      return {
        id: row.id,
        status: row.status,
      };
    });
  }

  async listScimTokens(principal: Principal) {
    await this.assertEnterpriseEnabled(principal.organizationId);
    return this.database.db
      .select({
        id: enterpriseScimTokens.id,
        name: enterpriseScimTokens.name,
        tokenPrefix: enterpriseScimTokens.tokenPrefix,
        lastUsedAt: enterpriseScimTokens.lastUsedAt,
        expiresAt: enterpriseScimTokens.expiresAt,
        revokedAt: enterpriseScimTokens.revokedAt,
        createdAt: enterpriseScimTokens.createdAt,
      })
      .from(enterpriseScimTokens)
      .where(eq(enterpriseScimTokens.organizationId, principal.organizationId))
      .orderBy(desc(enterpriseScimTokens.createdAt));
  }

  async createScimToken(principal: Principal, dto: CreateScimTokenDto) {
    await this.assertEnterpriseEnabled(principal.organizationId);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException('SCIM token expiry must be in the future.');
    }
    const credential = generateCredential('scim', 40);
    const [row] = await this.database.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(enterpriseScimTokens)
        .values({
          organizationId: principal.organizationId,
          createdByMemberId: principal.membershipId,
          name: dto.name.trim(),
          tokenPrefix: credential.prefix,
          tokenHash: credential.hash,
          expiresAt,
        })
        .returning();
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'enterprise.scim_token.create',
        resourceType: 'scim_token',
        resourceId: created.id,
        after: {
          name: created.name,
          tokenPrefix: created.tokenPrefix,
          expiresAt: created.expiresAt,
        },
      });
      return [created];
    });
    return {
      id: row.id,
      name: row.name,
      tokenPrefix: row.tokenPrefix,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      token: credential.secret,
    };
  }

  async revokeScimToken(principal: Principal, id: string) {
    await this.assertEnterpriseEnabled(principal.organizationId);
    const [before] = await this.database.db
      .select()
      .from(enterpriseScimTokens)
      .where(
        and(
          eq(enterpriseScimTokens.organizationId, principal.organizationId),
          eq(enterpriseScimTokens.id, id),
        ),
      )
      .limit(1);
    if (!before) throw new NotFoundException('SCIM token not found.');
    if (before.revokedAt) return before;

    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(enterpriseScimTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(enterpriseScimTokens.organizationId, principal.organizationId),
            eq(enterpriseScimTokens.id, id),
          ),
        )
        .returning();
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'enterprise.scim_token.revoke',
        resourceType: 'scim_token',
        resourceId: id,
        before: { revokedAt: before.revokedAt },
        after: { revokedAt: row.revokedAt },
      });
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'enterprise.scim_token.revoked.v1',
        aggregateType: 'scim_token',
        aggregateId: id,
        payload: { scimTokenId: id },
      });
      return row;
    });
  }

  async authenticateScimToken(secret: string): Promise<ScimIdentity> {
    const now = new Date();
    const rows = await this.database.db
      .select({
        id: enterpriseScimTokens.id,
        organizationId: enterpriseScimTokens.organizationId,
      })
      .from(enterpriseScimTokens)
      .where(
        and(
          eq(enterpriseScimTokens.tokenHash, hashCredential(secret)),
          isNull(enterpriseScimTokens.revokedAt),
          or(
            isNull(enterpriseScimTokens.expiresAt),
            gt(enterpriseScimTokens.expiresAt, now),
          ),
        ),
      )
      .limit(1);
    const token = rows[0];
    if (!token) throw new UnauthorizedException('Invalid or expired SCIM token.');
    if (
      !(await this.entitlements.can(
        token.organizationId,
        'enterprise.controls',
      ))
    ) {
      throw new UnauthorizedException('Enterprise controls are not enabled.');
    }
    await this.database.db
      .update(enterpriseScimTokens)
      .set({ lastUsedAt: now })
      .where(eq(enterpriseScimTokens.id, token.id));
    return { organizationId: token.organizationId, tokenId: token.id };
  }

  async listScimUsers(identity: ScimIdentity, filter?: string) {
    const rows = await this.database.db
      .select({
        membershipId: organizationMembers.id,
        status: organizationMembers.status,
        joinedAt: organizationMembers.joinedAt,
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, identity.organizationId))
      .orderBy(users.email);

    let filtered = rows;
    const emailFilter = this.parseScimEmailFilter(filter);
    if (emailFilter) {
      filtered = rows.filter(
        (row) => row.email.toLowerCase() === emailFilter.toLowerCase(),
      );
    }

    return {
      schemas: [
        'urn:ietf:params:scim:api:messages:2.0:ListResponse',
      ],
      totalResults: filtered.length,
      startIndex: 1,
      itemsPerPage: filtered.length,
      Resources: filtered.map((row) => this.scimUser(row)),
    };
  }

  async getScimUser(identity: ScimIdentity, membershipId: string) {
    const row = await this.getScimMembership(
      identity.organizationId,
      membershipId,
    );
    return this.scimUser(row);
  }

  async createScimUser(identity: ScimIdentity, dto: ScimCreateUserDto) {
    const email = dto.userName.trim().toLowerCase();
    await this.assertEmailAllowed(identity.organizationId, email);
    const displayName =
      dto.displayName?.trim() ||
      dto.name?.formatted?.trim() ||
      [dto.name?.givenName, dto.name?.familyName].filter(Boolean).join(' ') ||
      email.split('@')[0];
    const active = dto.active ?? true;

    return this.database.db.transaction(async (tx) => {
      let [user] = await tx
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (!user) {
        [user] = await tx
          .insert(users)
          .values({
            email,
            displayName,
            passwordHash: null,
          })
          .returning();
      }

      const [membership] = await tx
        .insert(organizationMembers)
        .values({
          organizationId: identity.organizationId,
          userId: user.id,
          status: active ? 'ACTIVE' : 'SUSPENDED',
          isOwner: false,
        })
        .onConflictDoUpdate({
          target: [
            organizationMembers.organizationId,
            organizationMembers.userId,
          ],
          set: { status: active ? 'ACTIVE' : 'SUSPENDED' },
        })
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: identity.organizationId,
        actorType: 'INTEGRATION',
        actorId: identity.tokenId,
        action: 'enterprise.scim.user.provision',
        resourceType: 'organization_member',
        resourceId: membership.id,
        after: {
          userId: user.id,
          email,
          displayName: user.displayName,
          status: membership.status,
        },
      });
      await tx.insert(outboxEvents).values({
        organizationId: identity.organizationId,
        eventType: 'enterprise.scim.user.provisioned.v1',
        aggregateType: 'organization_member',
        aggregateId: membership.id,
        payload: {
          membershipId: membership.id,
          userId: user.id,
          email,
          status: membership.status,
        },
      });

      return this.scimUser({
        membershipId: membership.id,
        status: membership.status,
        joinedAt: membership.joinedAt,
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
      });
    });
  }

  async patchScimUser(
    identity: ScimIdentity,
    membershipId: string,
    dto: ScimPatchUserDto,
  ) {
    const current = await this.getScimMembership(
      identity.organizationId,
      membershipId,
    );
    let active = current.status === 'ACTIVE';
    let displayName = current.displayName;

    for (const operation of dto.Operations) {
      const path = operation.path?.toLowerCase();
      if (path === 'active') {
        if (typeof operation.value !== 'boolean') {
          throw new BadRequestException('SCIM active must be boolean.');
        }
        active = operation.value;
      } else if (path === 'displayname') {
        if (typeof operation.value !== 'string') {
          throw new BadRequestException('SCIM displayName must be a string.');
        }
        displayName = operation.value.trim();
      } else if (!path && typeof operation.value === 'object' && operation.value) {
        const value = operation.value as Record<string, unknown>;
        if (typeof value.active === 'boolean') active = value.active;
        if (typeof value.displayName === 'string') {
          displayName = value.displayName.trim();
        }
      } else {
        throw new BadRequestException(
          `Unsupported SCIM patch path: ${operation.path ?? '(none)'}.`,
        );
      }
    }

    return this.database.db.transaction(async (tx) => {
      const [membership] = await tx
        .update(organizationMembers)
        .set({ status: active ? 'ACTIVE' : 'SUSPENDED' })
        .where(
          and(
            eq(organizationMembers.organizationId, identity.organizationId),
            eq(organizationMembers.id, membershipId),
          ),
        )
        .returning();

      if (displayName && displayName !== current.displayName) {
        await tx
          .update(users)
          .set({ displayName, updatedAt: new Date() })
          .where(eq(users.id, current.userId));
      }

      if (!active) {
        await tx
          .update(sessions)
          .set({ revokedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(sessions.organizationId, identity.organizationId),
              eq(sessions.organizationMemberId, membershipId),
              isNull(sessions.revokedAt),
            ),
          );
      }

      await tx.insert(auditLogs).values({
        organizationId: identity.organizationId,
        actorType: 'INTEGRATION',
        actorId: identity.tokenId,
        action: 'enterprise.scim.user.update',
        resourceType: 'organization_member',
        resourceId: membershipId,
        before: {
          status: current.status,
          displayName: current.displayName,
        },
        after: {
          status: membership.status,
          displayName,
        },
      });
      await tx.insert(outboxEvents).values({
        organizationId: identity.organizationId,
        eventType: 'enterprise.scim.user.updated.v1',
        aggregateType: 'organization_member',
        aggregateId: membershipId,
        payload: {
          membershipId,
          userId: current.userId,
          status: membership.status,
        },
      });

      return this.scimUser({
        ...current,
        status: membership.status,
        displayName,
      });
    });
  }

  async deleteScimUser(identity: ScimIdentity, membershipId: string) {
    const current = await this.getScimMembership(
      identity.organizationId,
      membershipId,
    );
    await this.database.db.transaction(async (tx) => {
      await tx
        .update(organizationMembers)
        .set({ status: 'SUSPENDED' })
        .where(
          and(
            eq(organizationMembers.organizationId, identity.organizationId),
            eq(organizationMembers.id, membershipId),
          ),
        );
      await tx
        .update(sessions)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(sessions.organizationId, identity.organizationId),
            eq(sessions.organizationMemberId, membershipId),
            isNull(sessions.revokedAt),
          ),
        );
      await tx.insert(auditLogs).values({
        organizationId: identity.organizationId,
        actorType: 'INTEGRATION',
        actorId: identity.tokenId,
        action: 'enterprise.scim.user.deprovision',
        resourceType: 'organization_member',
        resourceId: membershipId,
        before: { status: current.status },
        after: { status: 'SUSPENDED' },
      });
      await tx.insert(outboxEvents).values({
        organizationId: identity.organizationId,
        eventType: 'enterprise.scim.user.deprovisioned.v1',
        aggregateType: 'organization_member',
        aggregateId: membershipId,
        payload: { membershipId, userId: current.userId },
      });
    });
  }

  private async getOrCreatePolicy(organizationId: string) {
    const rows = await this.database.db
      .select()
      .from(enterpriseSecurityPolicies)
      .where(eq(enterpriseSecurityPolicies.organizationId, organizationId))
      .limit(1);
    if (rows[0]) return rows[0];

    const [created] = await this.database.db
      .insert(enterpriseSecurityPolicies)
      .values({ organizationId })
      .returning();
    return created;
  }

  private async getIdentityConnection(organizationId: string, id: string) {
    const rows = await this.database.db
      .select()
      .from(enterpriseIdentityConnections)
      .where(
        and(
          eq(enterpriseIdentityConnections.organizationId, organizationId),
          eq(enterpriseIdentityConnections.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Identity connection not found.');
    return rows[0];
  }

  private async getScimMembership(
    organizationId: string,
    membershipId: string,
  ) {
    const rows = await this.database.db
      .select({
        membershipId: organizationMembers.id,
        status: organizationMembers.status,
        joinedAt: organizationMembers.joinedAt,
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.id, membershipId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('SCIM user not found.');
    return rows[0];
  }

  private scimUser(row: {
    membershipId: string;
    status: string;
    joinedAt: Date;
    userId: string;
    email: string;
    displayName: string;
  }) {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: row.membershipId,
      userName: row.email,
      displayName: row.displayName,
      active: row.status === 'ACTIVE',
      emails: [{ value: row.email, primary: true }],
      meta: {
        resourceType: 'User',
        created: row.joinedAt.toISOString(),
      },
    };
  }

  private parseScimEmailFilter(filter?: string) {
    if (!filter) return undefined;
    const match = filter.match(/^userName\s+eq\s+"([^"]+)"$/i);
    if (!match) {
      throw new BadRequestException(
        'Only SCIM filter userName eq "email" is supported.',
      );
    }
    return match[1];
  }

  private async assertEmailAllowed(organizationId: string, email: string) {
    const [policy] = await this.database.db
      .select({ domains: enterpriseSecurityPolicies.allowedEmailDomains })
      .from(enterpriseSecurityPolicies)
      .where(eq(enterpriseSecurityPolicies.organizationId, organizationId))
      .limit(1);
    const domains = policy?.domains ?? [];
    if (!domains.length) return;
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain || !domains.includes(domain)) {
      throw new ForbiddenException(
        'Email domain is not allowed by enterprise security policy.',
      );
    }
  }

  private async assertEnterpriseEnabled(organizationId: string) {
    if (
      !(await this.entitlements.can(
        organizationId,
        'enterprise.controls',
      ))
    ) {
      throw new ForbiddenException(
        'Enterprise controls are not enabled for this organization.',
      );
    }
  }

  private normalizeDomain(raw: string) {
    const domain = raw.trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      throw new BadRequestException(`Invalid email domain: ${raw}.`);
    }
    return domain;
  }

  private async getActiveIdentityConnection(id: string) {
    const rows = await this.database.db
      .select()
      .from(enterpriseIdentityConnections)
      .where(
        and(
          eq(enterpriseIdentityConnections.id, id),
          eq(enterpriseIdentityConnections.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException(
        'Active enterprise identity connection not found.',
      );
    }
    return rows[0];
  }

  private oidcMetadata(metadata: Record<string, unknown> | null) {
    const authorizationEndpoint =
      typeof metadata?.authorization_endpoint === 'string'
        ? metadata.authorization_endpoint
        : '';
    const tokenEndpoint =
      typeof metadata?.token_endpoint === 'string'
        ? metadata.token_endpoint
        : '';
    const userinfoEndpoint =
      typeof metadata?.userinfo_endpoint === 'string'
        ? metadata.userinfo_endpoint
        : '';
    if (!authorizationEndpoint || !tokenEndpoint || !userinfoEndpoint) {
      throw new BadRequestException(
        'OIDC connection must be verified before sign-in.',
      );
    }
    const tokenEndpointAuthMethods = Array.isArray(
      metadata?.token_endpoint_auth_methods_supported,
    )
      ? metadata.token_endpoint_auth_methods_supported.filter(
          (value): value is string => typeof value === 'string',
        )
      : ['client_secret_post'];
    return {
      authorizationEndpoint,
      tokenEndpoint,
      userinfoEndpoint,
      tokenEndpointAuthMethods,
    };
  }

  private oidcCallbackUrl() {
    return (
      this.config.getOrThrow<string>('PUBLIC_API_ORIGIN').replace(/\/$/, '') +
      '/v1/enterprise/sso/oidc/callback'
    );
  }

  private sanitizeReturnTo(raw?: string) {
    const value = raw?.trim() || '/dashboard';
    if (
      value.length > 500 ||
      !value.startsWith('/') ||
      value.startsWith('//') ||
      /[\r\n]/.test(value)
    ) {
      throw new BadRequestException('Invalid SSO return path.');
    }
    return value;
  }

  private async resolveOidcIdentity(
    connectionId: string,
    organizationId: string,
    subject: string,
    email: string,
  ) {
    const [existingLink] = await this.database.db
      .select()
      .from(enterpriseIdentityLinks)
      .where(
        and(
          eq(enterpriseIdentityLinks.connectionId, connectionId),
          eq(enterpriseIdentityLinks.subject, subject),
        ),
      )
      .limit(1);

    if (existingLink) {
      const [membership] = await this.database.db
        .select({
          membershipId: organizationMembers.id,
          userId: users.id,
          email: users.email,
        })
        .from(organizationMembers)
        .innerJoin(users, eq(users.id, organizationMembers.userId))
        .where(
          and(
            eq(organizationMembers.id, existingLink.membershipId),
            eq(organizationMembers.organizationId, organizationId),
            eq(organizationMembers.userId, existingLink.userId),
            eq(organizationMembers.status, 'ACTIVE'),
          ),
        )
        .limit(1);
      if (!membership) {
        throw new UnauthorizedException(
          'Linked SSO account is no longer active.',
        );
      }
      if (membership.email.toLowerCase() !== email) {
        throw new UnauthorizedException(
          'OIDC email no longer matches the provisioned account.',
        );
      }
      return {
        linkId: existingLink.id,
        userId: membership.userId,
        membershipId: membership.membershipId,
      };
    }

    const [account] = await this.database.db
      .select({
        userId: users.id,
        membershipId: organizationMembers.id,
      })
      .from(users)
      .innerJoin(
        organizationMembers,
        eq(organizationMembers.userId, users.id),
      )
      .where(
        and(
          eq(users.email, email),
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!account) {
      throw new UnauthorizedException(
        'SSO user is not provisioned in this organization. Provision the user through SCIM or tenant administration first.',
      );
    }

    const [linkedUser] = await this.database.db
      .select()
      .from(enterpriseIdentityLinks)
      .where(
        and(
          eq(enterpriseIdentityLinks.connectionId, connectionId),
          eq(enterpriseIdentityLinks.userId, account.userId),
        ),
      )
      .limit(1);
    if (linkedUser && linkedUser.subject !== subject) {
      throw new ConflictException(
        'This tenant user is already linked to a different OIDC identity.',
      );
    }

    const [link] = await this.database.db
      .insert(enterpriseIdentityLinks)
      .values({
        organizationId,
        connectionId,
        userId: account.userId,
        membershipId: account.membershipId,
        subject,
        email,
      })
      .returning();

    return {
      linkId: link.id,
      userId: account.userId,
      membershipId: account.membershipId,
    };
  }

  private async assertSafeExternalUrl(raw: string, label: string) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException(`${label} URL is invalid.`);
    }
    if (!['https:', 'http:'].includes(url.protocol)) {
      throw new BadRequestException(
        `${label} must use HTTP or HTTPS.`,
      );
    }

    if (this.config.get<string>('NODE_ENV') !== 'production') return;

    if (url.protocol !== 'https:') {
      throw new BadRequestException(
        `Production ${label} must use HTTPS.`,
      );
    }

    const hostname = url.hostname;
    const literalFamily = isIP(hostname);
    let addresses: Array<{ address: string; family: number }>;
    try {
      addresses = literalFamily
        ? [{ address: hostname, family: literalFamily }]
        : await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new BadRequestException(
        `${label} hostname could not be resolved.`,
      );
    }

    for (const address of addresses) {
      if (
        blockedExternalNetworks.check(
          address.address,
          address.family === 4 ? 'ipv4' : 'ipv6',
        )
      ) {
        throw new BadRequestException(
          `${label} resolves to a private or reserved network.`,
        );
      }
    }
  }

  private assertExternalIssuerUrl(raw: string) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('OIDC issuer URL is invalid.');
    }

    if (url.protocol !== 'https:') {
      throw new BadRequestException('OIDC issuers must use HTTPS.');
    }

    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost') {
      throw new BadRequestException(
        'OIDC issuer cannot target a local or private network.',
      );
    }

    const family = isIP(hostname);
    if (
      family &&
      blockedExternalNetworks.check(
        hostname,
        family === 4 ? 'ipv4' : 'ipv6',
      )
    ) {
      throw new BadRequestException(
        'OIDC issuer cannot target a local or private network.',
      );
    }
  }
}
