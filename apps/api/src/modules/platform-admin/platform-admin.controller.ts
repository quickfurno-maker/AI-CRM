import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { and, desc, eq } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  auditLogs,
  entitlements,
  organizations,
  outboxEvents,
} from '../../platform/database/schema.js';
import { ExtensionRegistryService } from '../../platform/extensions/extension-registry.service.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

class SetExtensionStateDto {
  @IsBoolean()
  enabled: boolean;
}

@Controller('platform-admin')
@UseGuards(PlatformAdminGuard)
export class PlatformAdminController {
  constructor(
    private readonly database: DatabaseService,
    private readonly extensions: ExtensionRegistryService,
  ) {}

  @Get('organizations')
  listOrganizations() {
    return this.database.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        status: organizations.status,
        createdAt: organizations.createdAt,
      })
      .from(organizations)
      .orderBy(desc(organizations.createdAt))
      .limit(100);
  }

  @Get('organizations/:id/extensions')
  async listOrganizationExtensions(
    @Param('id', ParseUUIDPipe) organizationId: string,
  ) {
    await this.assertOrganization(organizationId);
    const rows = await this.database.db
      .select({
        key: entitlements.key,
        enabled: entitlements.enabled,
        source: entitlements.source,
        limitValue: entitlements.limitValue,
        config: entitlements.config,
      })
      .from(entitlements)
      .where(eq(entitlements.organizationId, organizationId));
    const byKey = new Map(rows.map((row) => [row.key, row]));

    return this.extensions.manifests().map((manifest) => ({
      ...manifest,
      enabled: byKey.get(manifest.entitlement)?.enabled ?? false,
      source: byKey.get(manifest.entitlement)?.source ?? null,
      limitValue: byKey.get(manifest.entitlement)?.limitValue ?? null,
      config: byKey.get(manifest.entitlement)?.config ?? null,
    }));
  }

  @Put('organizations/:id/extensions/:extensionKey')
  async setOrganizationExtension(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('extensionKey') extensionKey: string,
    @Body() dto: SetExtensionStateDto,
  ) {
    await this.assertOrganization(organizationId);
    const manifest = this.extensions
      .manifests()
      .find((item) => item.key === extensionKey);
    if (!manifest) throw new NotFoundException('Extension not found.');

    return this.database.db.transaction(async (tx) => {
      const [entitlement] = await tx
        .insert(entitlements)
        .values({
          organizationId,
          key: manifest.entitlement,
          enabled: dto.enabled,
          source: 'ADDON',
        })
        .onConflictDoUpdate({
          target: [entitlements.organizationId, entitlements.key],
          set: {
            enabled: dto.enabled,
            source: 'ADDON',
            updatedAt: new Date(),
          },
        })
        .returning({
          key: entitlements.key,
          enabled: entitlements.enabled,
          source: entitlements.source,
          limitValue: entitlements.limitValue,
          config: entitlements.config,
        });

      const action = dto.enabled
        ? 'platform.extension.enable'
        : 'platform.extension.disable';
      await tx.insert(auditLogs).values({
        organizationId,
        actorType: 'USER',
        actorId: principal.userId,
        action,
        resourceType: 'extension',
        resourceId: manifest.key,
        after: {
          extensionKey: manifest.key,
          entitlement: manifest.entitlement,
          enabled: dto.enabled,
          source: 'ADDON',
        },
      });
      await tx.insert(outboxEvents).values({
        organizationId,
        eventType: 'platform.extension.updated.v1',
        aggregateType: 'extension',
        aggregateId: manifest.key,
        payload: {
          organizationId,
          extensionKey: manifest.key,
          entitlement: manifest.entitlement,
          enabled: dto.enabled,
          actorUserId: principal.userId,
        },
      });

      return {
        ...manifest,
        ...entitlement,
      };
    });
  }

  private async assertOrganization(organizationId: string) {
    const rows = await this.database.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(
        and(
          eq(organizations.id, organizationId),
          eq(organizations.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Organization not found.');
  }
}
