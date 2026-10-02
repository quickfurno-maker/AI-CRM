import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  apiKeys,
  auditLogs,
  outboxEvents,
  permissions,
} from '../../platform/database/schema.js';
import { EntitlementsService } from '../../platform/entitlements/entitlements.service.js';
import { ExtensionRegistryService } from '../../platform/extensions/extension-registry.service.js';
import { parseExtensionManifest } from '../../platform/extensions/extension-manifest.js';
import { PermissionsService } from '../../platform/permissions/permissions.service.js';
import { SecretCipherService } from '../../platform/security/secret-cipher.service.js';
import {
  CreateApiKeyDto,
  CreateOauthClientDto,
  CreateWebhookEndpointDto,
  DeveloperListQueryDto,
  InstallMarketplaceExtensionDto,
  OauthClientCredentialsDto,
  PublishMarketplaceExtensionDto,
  SetMarketplaceExtensionStatusDto,
  UpdateWebhookEndpointDto,
} from './developer.dto.js';
import {
  developerOauthClients,
  developerOauthTokens,
  developerWebhookDeliveries,
  developerWebhookEndpoints,
  marketplaceExtensions,
  marketplaceInstallations,
} from './developer.schema.js';
import {
  generateCredential,
  hashCredential,
  normalizeScopes,
} from './developer-credentials.js';

@Injectable()
export class DeveloperService {
  constructor(
    private readonly database: DatabaseService,
    private readonly permissionsService: PermissionsService,
    private readonly entitlements: EntitlementsService,
    private readonly extensions: ExtensionRegistryService,
    private readonly secrets: SecretCipherService,
    private readonly config: ConfigService,
  ) {}

  async listApiKeys(principal: Principal) {
    return this.database.db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        description: apiKeys.description,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        expiresAt: apiKeys.expiresAt,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, principal.organizationId))
      .orderBy(desc(apiKeys.createdAt));
  }

  async createApiKey(principal: Principal, dto: CreateApiKeyDto) {
    await this.assertApiEnabled(principal.organizationId);
    const scopes = await this.assertGrantableScopes(principal, dto.scopes);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException('API key expiry must be in the future.');
    }

    const credential = generateCredential('crmkey', 36);
    const [row] = await this.database.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(apiKeys)
        .values({
          organizationId: principal.organizationId,
          name: dto.name.trim(),
          description: dto.description?.trim(),
          createdByMemberId: principal.membershipId,
          keyPrefix: credential.prefix,
          keyHash: credential.hash,
          scopes,
          expiresAt,
        })
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'developer.api_key.create',
        resourceType: 'api_key',
        resourceId: created.id,
        after: {
          name: created.name,
          keyPrefix: created.keyPrefix,
          scopes: created.scopes,
          expiresAt: created.expiresAt,
        },
      });
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'developer.api_key.created.v1',
        aggregateType: 'api_key',
        aggregateId: created.id,
        payload: {
          apiKeyId: created.id,
          keyPrefix: created.keyPrefix,
          scopes: created.scopes,
        },
      });
      return [created];
    });

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      keyPrefix: row.keyPrefix,
      scopes: row.scopes,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      secret: credential.secret,
    };
  }

  async revokeApiKey(principal: Principal, id: string) {
    const [existing] = await this.database.db
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.organizationId, principal.organizationId),
          eq(apiKeys.id, id),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException('API key not found.');
    if (existing.revokedAt) return { ...existing, alreadyRevoked: true };

    const [row] = await this.database.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(apiKeys.organizationId, principal.organizationId),
            eq(apiKeys.id, id),
          ),
        )
        .returning();
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'developer.api_key.revoke',
        resourceType: 'api_key',
        resourceId: id,
        before: { revokedAt: existing.revokedAt },
        after: { revokedAt: updated.revokedAt },
      });
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'developer.api_key.revoked.v1',
        aggregateType: 'api_key',
        aggregateId: id,
        payload: { apiKeyId: id },
      });
      return [updated];
    });
    return row;
  }

  listOauthClients(principal: Principal) {
    return this.database.db
      .select({
        id: developerOauthClients.id,
        name: developerOauthClients.name,
        description: developerOauthClients.description,
        clientId: developerOauthClients.clientId,
        clientSecretPrefix: developerOauthClients.clientSecretPrefix,
        scopes: developerOauthClients.scopes,
        grantTypes: developerOauthClients.grantTypes,
        status: developerOauthClients.status,
        lastUsedAt: developerOauthClients.lastUsedAt,
        createdAt: developerOauthClients.createdAt,
      })
      .from(developerOauthClients)
      .where(eq(developerOauthClients.organizationId, principal.organizationId))
      .orderBy(desc(developerOauthClients.createdAt));
  }

  async createOauthClient(principal: Principal, dto: CreateOauthClientDto) {
    await this.assertApiEnabled(principal.organizationId);
    const scopes = await this.assertGrantableScopes(principal, dto.scopes);
    const clientId = `crm_client_${generateCredential('id', 18).secret.split('_').slice(1).join('_')}`;
    const credential = generateCredential('crmsecret', 36);

    const [row] = await this.database.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(developerOauthClients)
        .values({
          organizationId: principal.organizationId,
          createdByMemberId: principal.membershipId,
          name: dto.name.trim(),
          description: dto.description?.trim(),
          clientId,
          clientSecretHash: credential.hash,
          clientSecretPrefix: credential.prefix,
          scopes,
          grantTypes: ['client_credentials'],
        })
        .returning();
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'developer.oauth_client.create',
        resourceType: 'oauth_client',
        resourceId: created.id,
        after: {
          name: created.name,
          clientId: created.clientId,
          scopes: created.scopes,
        },
      });
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'developer.oauth_client.created.v1',
        aggregateType: 'oauth_client',
        aggregateId: created.id,
        payload: { oauthClientId: created.id, scopes: created.scopes },
      });
      return [created];
    });

    return {
      id: row.id,
      name: row.name,
      clientId: row.clientId,
      clientSecret: credential.secret,
      clientSecretPrefix: row.clientSecretPrefix,
      scopes: row.scopes,
      createdAt: row.createdAt,
    };
  }

  async rotateOauthClientSecret(principal: Principal, id: string) {
    const existing = await this.getOauthClient(principal.organizationId, id);
    const credential = generateCredential('crmsecret', 36);
    const [updated] = await this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(developerOauthClients)
        .set({
          clientSecretHash: credential.hash,
          clientSecretPrefix: credential.prefix,
          updatedAt: new Date(),
        })
        .where(eq(developerOauthClients.id, id))
        .returning();

      await tx
        .update(developerOauthTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(developerOauthTokens.clientId, id),
            isNull(developerOauthTokens.revokedAt),
          ),
        );
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'developer.oauth_client.rotate_secret',
        resourceType: 'oauth_client',
        resourceId: id,
        before: { clientSecretPrefix: existing.clientSecretPrefix },
        after: { clientSecretPrefix: credential.prefix },
      });
      return [row];
    });

    return {
      id: updated.id,
      clientId: updated.clientId,
      clientSecret: credential.secret,
      clientSecretPrefix: updated.clientSecretPrefix,
    };
  }

  async setOauthClientStatus(
    principal: Principal,
    id: string,
    status: 'ACTIVE' | 'REVOKED',
  ) {
    const before = await this.getOauthClient(principal.organizationId, id);
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(developerOauthClients)
        .set({ status, updatedAt: new Date() })
        .where(
          and(
            eq(developerOauthClients.organizationId, principal.organizationId),
            eq(developerOauthClients.id, id),
          ),
        )
        .returning();
      if (status === 'REVOKED') {
        await tx
          .update(developerOauthTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(developerOauthTokens.clientId, id),
              isNull(developerOauthTokens.revokedAt),
            ),
          );
      }
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'developer.oauth_client.status_update',
        resourceType: 'oauth_client',
        resourceId: id,
        before: { status: before.status },
        after: { status: row.status },
      });
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'developer.oauth_client.status_updated.v1',
        aggregateType: 'oauth_client',
        aggregateId: id,
        payload: { oauthClientId: id, status: row.status },
      });
      return row;
    });
  }

  async issueClientCredentials(dto: OauthClientCredentialsDto) {
    const rows = await this.database.db
      .select()
      .from(developerOauthClients)
      .where(eq(developerOauthClients.clientId, dto.clientId))
      .limit(1);
    const client = rows[0];
    if (
      !client ||
      client.status !== 'ACTIVE' ||
      hashCredential(dto.clientSecret) !== client.clientSecretHash
    ) {
      throw new UnauthorizedException('Invalid OAuth client credentials.');
    }

    if (!(await this.entitlements.can(client.organizationId, 'core.api'))) {
      throw new UnauthorizedException('API access is not enabled.');
    }

    const requestedScopes = dto.scope
      ? normalizeScopes(dto.scope.split(/\s+/))
      : client.scopes;
    const allowed = new Set(client.scopes);
    if (requestedScopes.some((scope) => !allowed.has(scope))) {
      throw new ForbiddenException('Requested OAuth scope is not allowed.');
    }

    const credential = generateCredential('crmoauth', 40);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.database.db.transaction(async (tx) => {
      await tx.insert(developerOauthTokens).values({
        organizationId: client.organizationId,
        clientId: client.id,
        tokenPrefix: credential.prefix,
        tokenHash: credential.hash,
        scopes: requestedScopes,
        expiresAt,
      });
      await tx
        .update(developerOauthClients)
        .set({ lastUsedAt: new Date(), updatedAt: new Date() })
        .where(eq(developerOauthClients.id, client.id));
      await tx.insert(outboxEvents).values({
        organizationId: client.organizationId,
        eventType: 'developer.oauth_token.issued.v1',
        aggregateType: 'oauth_client',
        aggregateId: client.id,
        payload: {
          oauthClientId: client.id,
          scopes: requestedScopes,
          expiresAt: expiresAt.toISOString(),
        },
      });
    });

    return {
      access_token: credential.secret,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: requestedScopes.join(' '),
    };
  }

  listWebhookEndpoints(principal: Principal) {
    return this.database.db
      .select({
        id: developerWebhookEndpoints.id,
        name: developerWebhookEndpoints.name,
        url: developerWebhookEndpoints.url,
        events: developerWebhookEndpoints.events,
        status: developerWebhookEndpoints.status,
        failureCount: developerWebhookEndpoints.failureCount,
        lastSuccessAt: developerWebhookEndpoints.lastSuccessAt,
        lastFailureAt: developerWebhookEndpoints.lastFailureAt,
        createdAt: developerWebhookEndpoints.createdAt,
        updatedAt: developerWebhookEndpoints.updatedAt,
      })
      .from(developerWebhookEndpoints)
      .where(
        eq(developerWebhookEndpoints.organizationId, principal.organizationId),
      )
      .orderBy(desc(developerWebhookEndpoints.createdAt));
  }

  async createWebhookEndpoint(
    principal: Principal,
    dto: CreateWebhookEndpointDto,
  ) {
    await this.assertApiEnabled(principal.organizationId);
    this.assertWebhookUrl(dto.url);
    const events = this.normalizeEvents(dto.events);
    const secret = generateCredential('whsec', 36);

    const [row] = await this.database.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(developerWebhookEndpoints)
        .values({
          organizationId: principal.organizationId,
          createdByMemberId: principal.membershipId,
          name: dto.name.trim(),
          url: dto.url,
          events,
          signingSecretCiphertext: this.secrets.encrypt(secret.secret),
        })
        .returning();
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'developer.webhook.create',
        resourceType: 'webhook_endpoint',
        resourceId: created.id,
        after: {
          name: created.name,
          url: created.url,
          events: created.events,
          status: created.status,
        },
      });
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'developer.webhook.created.v1',
        aggregateType: 'webhook_endpoint',
        aggregateId: created.id,
        payload: { endpointId: created.id, events: created.events },
      });
      return [created];
    });

    return {
      id: row.id,
      name: row.name,
      url: row.url,
      events: row.events,
      status: row.status,
      signingSecret: secret.secret,
      createdAt: row.createdAt,
    };
  }

  async updateWebhookEndpoint(
    principal: Principal,
    id: string,
    dto: UpdateWebhookEndpointDto,
  ) {
    const existing = await this.getWebhookEndpoint(
      principal.organizationId,
      id,
    );
    if (dto.url) this.assertWebhookUrl(dto.url);
    const [row] = await this.database.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(developerWebhookEndpoints)
        .set({
          name: dto.name?.trim(),
          url: dto.url,
          events: dto.events ? this.normalizeEvents(dto.events) : undefined,
          status: dto.status,
          updatedAt: new Date(),
        })
        .where(eq(developerWebhookEndpoints.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'developer.webhook.update',
        resourceType: 'webhook_endpoint',
        resourceId: id,
        before: {
          name: existing.name,
          url: existing.url,
          events: existing.events,
          status: existing.status,
        },
        after: {
          name: updated.name,
          url: updated.url,
          events: updated.events,
          status: updated.status,
        },
      });
      return [updated];
    });
    return row;
  }

  async rotateWebhookSecret(principal: Principal, id: string) {
    await this.getWebhookEndpoint(principal.organizationId, id);
    const secret = generateCredential('whsec', 36);
    await this.database.db.transaction(async (tx) => {
      await tx
        .update(developerWebhookEndpoints)
        .set({
          signingSecretCiphertext: this.secrets.encrypt(secret.secret),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(
              developerWebhookEndpoints.organizationId,
              principal.organizationId,
            ),
            eq(developerWebhookEndpoints.id, id),
          ),
        );
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'developer.webhook.rotate_secret',
        resourceType: 'webhook_endpoint',
        resourceId: id,
      });
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'developer.webhook.secret_rotated.v1',
        aggregateType: 'webhook_endpoint',
        aggregateId: id,
        payload: { endpointId: id },
      });
    });
    return { id, signingSecret: secret.secret };
  }

  async listWebhookDeliveries(
    principal: Principal,
    query: DeveloperListQueryDto,
  ) {
    return this.database.db
      .select({
        id: developerWebhookDeliveries.id,
        endpointId: developerWebhookDeliveries.endpointId,
        eventId: developerWebhookDeliveries.eventId,
        eventType: developerWebhookDeliveries.eventType,
        status: developerWebhookDeliveries.status,
        attempts: developerWebhookDeliveries.attempts,
        responseStatus: developerWebhookDeliveries.responseStatus,
        lastError: developerWebhookDeliveries.lastError,
        deliveredAt: developerWebhookDeliveries.deliveredAt,
        createdAt: developerWebhookDeliveries.createdAt,
      })
      .from(developerWebhookDeliveries)
      .where(
        eq(developerWebhookDeliveries.organizationId, principal.organizationId),
      )
      .orderBy(desc(developerWebhookDeliveries.createdAt))
      .limit(query.limit);
  }

  async marketplaceCatalog(principal: Principal) {
    const [thirdParty, installations, entitlements] = await Promise.all([
      this.database.db
        .select()
        .from(marketplaceExtensions)
        .where(eq(marketplaceExtensions.status, 'PUBLISHED'))
        .orderBy(desc(marketplaceExtensions.createdAt)),
      this.database.db
        .select()
        .from(marketplaceInstallations)
        .where(
          eq(
            marketplaceInstallations.organizationId,
            principal.organizationId,
          ),
        ),
      this.entitlements.list(principal.organizationId),
    ]);
    const installedByExtension = new Map(
      installations.map((item) => [item.extensionId, item]),
    );
    const enabledEntitlements = new Set(
      entitlements.filter((item) => item.enabled).map((item) => item.key),
    );

    const firstParty = this.extensions.manifests().map((manifest) => ({
      kind: 'FIRST_PARTY' as const,
      key: manifest.key,
      name: manifest.name,
      version: manifest.version,
      publisher: 'CRM-AI',
      description: manifest.description,
      category: 'BUSINESS_EXTENSION',
      requiredScopes: manifest.permissions,
      eventSubscriptions: manifest.events,
      manifest,
      installMode: 'PROVIDER_ENTITLEMENT' as const,
      installed: enabledEntitlements.has(manifest.entitlement),
      status: 'PUBLISHED',
    }));

    const external = thirdParty.map((extension) => {
      const installation = installedByExtension.get(extension.id);
      return {
        kind: 'MARKETPLACE' as const,
        id: extension.id,
        key: extension.key,
        name: extension.name,
        version: extension.version,
        publisher: extension.publisher,
        description: extension.description,
        category: extension.category,
        requiredScopes: extension.requiredScopes,
        eventSubscriptions: extension.eventSubscriptions,
        manifest: extension.manifest,
        installMode: 'TENANT_INSTALL' as const,
        installed: installation?.status === 'ACTIVE',
        installationId: installation?.id,
        status: extension.status,
      };
    });

    return [...firstParty, ...external];
  }

  async installMarketplaceExtension(
    principal: Principal,
    extensionId: string,
    dto: InstallMarketplaceExtensionDto,
  ) {
    if (
      !(await this.entitlements.can(
        principal.organizationId,
        'marketplace.enabled',
      ))
    ) {
      throw new ForbiddenException('Marketplace installation is not enabled.');
    }
    const [extension] = await this.database.db
      .select()
      .from(marketplaceExtensions)
      .where(
        and(
          eq(marketplaceExtensions.id, extensionId),
          eq(marketplaceExtensions.status, 'PUBLISHED'),
        ),
      )
      .limit(1);
    if (!extension) throw new NotFoundException('Marketplace extension not found.');

    const required = normalizeScopes(extension.requiredScopes);
    const granted = normalizeScopes(dto.scopes ?? required);
    if (
      required.some((scope) => !granted.includes(scope)) ||
      granted.some((scope) => !required.includes(scope))
    ) {
      throw new BadRequestException(
        'Granted scopes must exactly match the extension required scopes.',
      );
    }
    await this.assertGrantableScopes(principal, granted);

    const [installation] = await this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(marketplaceInstallations)
        .values({
          organizationId: principal.organizationId,
          extensionId,
          installedByMemberId: principal.membershipId,
          status: 'ACTIVE',
          grantedScopes: granted,
          config: dto.config,
        })
        .onConflictDoUpdate({
          target: [
            marketplaceInstallations.organizationId,
            marketplaceInstallations.extensionId,
          ],
          set: {
            installedByMemberId: principal.membershipId,
            status: 'ACTIVE',
            grantedScopes: granted,
            config: dto.config,
            updatedAt: new Date(),
          },
        })
        .returning();
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'marketplace.extension.install',
        resourceType: 'marketplace_extension',
        resourceId: extensionId,
        after: {
          extensionKey: extension.key,
          version: extension.version,
          grantedScopes: granted,
        },
      });
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'marketplace.extension.installed.v1',
        aggregateType: 'marketplace_extension',
        aggregateId: extensionId,
        payload: {
          extensionId,
          extensionKey: extension.key,
          version: extension.version,
          grantedScopes: granted,
        },
      });
      return [row];
    });
    return installation;
  }

  async uninstallMarketplaceExtension(
    principal: Principal,
    extensionId: string,
  ) {
    const [existing] = await this.database.db
      .select()
      .from(marketplaceInstallations)
      .where(
        and(
          eq(
            marketplaceInstallations.organizationId,
            principal.organizationId,
          ),
          eq(marketplaceInstallations.extensionId, extensionId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException('Extension installation not found.');

    const [row] = await this.database.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(marketplaceInstallations)
        .set({ status: 'REMOVED', updatedAt: new Date() })
        .where(eq(marketplaceInstallations.id, existing.id))
        .returning();
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'marketplace.extension.uninstall',
        resourceType: 'marketplace_extension',
        resourceId: extensionId,
      });
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'marketplace.extension.uninstalled.v1',
        aggregateType: 'marketplace_extension',
        aggregateId: extensionId,
        payload: { extensionId },
      });
      return [updated];
    });
    return row;
  }

  async publishMarketplaceExtension(
    principal: Principal,
    dto: PublishMarketplaceExtensionDto,
  ) {
    const manifest = parseExtensionManifest(dto.manifest);
    if (
      manifest.key !== dto.key ||
      manifest.name !== dto.name ||
      manifest.version !== dto.version ||
      manifest.publisher !== dto.publisher
    ) {
      throw new BadRequestException(
        'Manifest identity must match the marketplace listing.',
      );
    }
    const scopes = normalizeScopes(dto.requiredScopes);
    if (
      normalizeScopes(manifest.apiScopes).join('|') !== scopes.join('|')
    ) {
      throw new BadRequestException(
        'Manifest apiScopes must match requiredScopes.',
      );
    }
    await this.assertKnownScopes(scopes);

    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(marketplaceExtensions)
        .values({
          key: dto.key,
          name: dto.name.trim(),
          version: dto.version,
          publisher: dto.publisher.trim(),
          description: dto.description.trim(),
          category: dto.category?.trim() ?? manifest.category,
          manifest,
          requiredScopes: scopes,
          eventSubscriptions:
            dto.eventSubscriptions ?? manifest.eventSubscriptions,
          status: 'DRAFT',
          isFirstParty: dto.isFirstParty ?? false,
        })
        .onConflictDoUpdate({
          target: [marketplaceExtensions.key, marketplaceExtensions.version],
          set: {
            name: dto.name.trim(),
            publisher: dto.publisher.trim(),
            description: dto.description.trim(),
            category: dto.category?.trim() ?? manifest.category,
            manifest,
            requiredScopes: scopes,
            eventSubscriptions:
              dto.eventSubscriptions ?? manifest.eventSubscriptions,
            isFirstParty: dto.isFirstParty ?? false,
            updatedAt: new Date(),
          },
        })
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'platform.marketplace_extension.upsert',
        resourceType: 'marketplace_extension',
        resourceId: row.id,
        after: {
          key: row.key,
          version: row.version,
          publisher: row.publisher,
          status: row.status,
          isFirstParty: row.isFirstParty,
        },
      });
      await tx.insert(outboxEvents).values({
        organizationId: null,
        eventType: 'platform.marketplace_extension.upserted.v1',
        aggregateType: 'marketplace_extension',
        aggregateId: row.id,
        payload: {
          extensionId: row.id,
          key: row.key,
          version: row.version,
          status: row.status,
        },
      });
      return row;
    });
  }

  async setMarketplaceExtensionStatus(
    principal: Principal,
    id: string,
    dto: SetMarketplaceExtensionStatusDto,
  ) {
    const [before] = await this.database.db
      .select()
      .from(marketplaceExtensions)
      .where(eq(marketplaceExtensions.id, id))
      .limit(1);
    if (!before) {
      throw new NotFoundException('Marketplace extension not found.');
    }

    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(marketplaceExtensions)
        .set({ status: dto.status, updatedAt: new Date() })
        .where(eq(marketplaceExtensions.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'platform.marketplace_extension.status_update',
        resourceType: 'marketplace_extension',
        resourceId: id,
        before: { status: before.status },
        after: { status: row.status },
      });
      await tx.insert(outboxEvents).values({
        organizationId: null,
        eventType: 'platform.marketplace_extension.status_updated.v1',
        aggregateType: 'marketplace_extension',
        aggregateId: id,
        payload: {
          extensionId: id,
          key: row.key,
          version: row.version,
          status: row.status,
        },
      });
      return row;
    });
  }

  async listMarketplaceAdmin() {
    return this.database.db
      .select()
      .from(marketplaceExtensions)
      .orderBy(desc(marketplaceExtensions.createdAt));
  }

  sdkContract() {
    return {
      schemaVersion: '1',
      executionModel: 'EXTERNAL_APP',
      security:
        'Extensions receive only explicitly granted API scopes and subscribed events. Arbitrary extension code is never executed inside the CRM-AI runtime.',
      manifestExample: {
        schemaVersion: '1',
        key: 'example-extension',
        name: 'Example Extension',
        version: '1.0.0',
        publisher: 'Example Publisher',
        description: 'Example external integration for CRM-AI.',
        category: 'INTEGRATION',
        apiScopes: ['crm.contact.read'],
        eventSubscriptions: ['crm.lead.created.v1'],
      },
    };
  }

  private async getOauthClient(organizationId: string, id: string) {
    const rows = await this.database.db
      .select()
      .from(developerOauthClients)
      .where(
        and(
          eq(developerOauthClients.organizationId, organizationId),
          eq(developerOauthClients.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('OAuth client not found.');
    return rows[0];
  }

  private async getWebhookEndpoint(organizationId: string, id: string) {
    const rows = await this.database.db
      .select()
      .from(developerWebhookEndpoints)
      .where(
        and(
          eq(developerWebhookEndpoints.organizationId, organizationId),
          eq(developerWebhookEndpoints.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Webhook endpoint not found.');
    return rows[0];
  }

  private async assertApiEnabled(organizationId: string) {
    if (!(await this.entitlements.can(organizationId, 'core.api'))) {
      throw new ForbiddenException('API access is not enabled for this organization.');
    }
  }

  private async assertKnownScopes(scopes: string[]) {
    if (!scopes.length) return;
    const rows = await this.database.db
      .select({ key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, scopes));
    const known = new Set(rows.map((row) => row.key));
    const unknown = scopes.filter((scope) => !known.has(scope));
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown API permission scopes: ${unknown.join(', ')}`,
      );
    }
  }

  private async assertGrantableScopes(
    principal: Principal,
    input: string[],
  ) {
    const scopes = normalizeScopes(input);
    if (!scopes.length) {
      throw new BadRequestException('At least one API scope is required.');
    }
    await this.assertKnownScopes(scopes);
    if (principal.authScopes) {
      const allowed = new Set(principal.authScopes);
      const escalated = scopes.filter((scope) => !allowed.has(scope));
      if (escalated.length) {
        throw new ForbiddenException(
          `External credentials cannot grant scopes they do not hold: ${escalated.join(', ')}.`,
        );
      }
      return scopes;
    }
    if (principal.isPlatformAdmin) return scopes;

    for (const scope of scopes) {
      if (
        !(await this.permissionsService.hasOrganizationPermission({
          organizationId: principal.organizationId,
          membershipId: principal.membershipId,
          permission: scope,
        }))
      ) {
        throw new ForbiddenException(
          `You cannot grant a scope you do not hold: ${scope}.`,
        );
      }
    }
    return scopes;
  }

  private normalizeEvents(events: string[]) {
    const normalized = [
      ...new Set(events.map((event) => event.trim()).filter(Boolean)),
    ].sort();
    if (!normalized.length) {
      throw new BadRequestException('At least one webhook event is required.');
    }
    for (const event of normalized) {
      if (
        event !== '*' &&
        !/^[a-z][a-z0-9_.-]{2,179}$/i.test(event)
      ) {
        throw new BadRequestException(`Invalid webhook event: ${event}.`);
      }
    }
    return normalized;
  }

  private assertWebhookUrl(raw: string) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('Webhook URL is invalid.');
    }
    if (!['https:', 'http:'].includes(url.protocol)) {
      throw new BadRequestException('Webhook URL must use HTTP or HTTPS.');
    }

    const host = url.hostname.toLowerCase();
    const privateHost =
      host === 'localhost' ||
      host === '::1' ||
      host === '127.0.0.1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.startsWith('169.254.');

    if (this.config.get<string>('NODE_ENV') === 'production') {
      if (url.protocol !== 'https:') {
        throw new BadRequestException(
          'Production webhook endpoints must use HTTPS.',
        );
      }
      if (privateHost) {
        throw new BadRequestException(
          'Private-network webhook endpoints are not allowed in production.',
        );
      }
    }
  }
}
