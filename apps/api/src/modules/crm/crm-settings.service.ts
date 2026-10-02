import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import { auditLogs, outboxEvents } from '../../platform/database/schema.js';
import {
  customFieldDefinitions,
  customFieldValues,
  savedLists,
  tags,
} from './crm.schema.js';
import { CrmProvisioningService } from './crm-provisioning.service.js';
import { CrmReferenceService } from './crm-reference.service.js';
import type {
  CreateCustomFieldDto,
  CreateSavedListDto,
  CreateTagDto,
  SetCustomFieldValueDto,
} from './dto/crm.dto.js';

@Injectable()
export class CrmSettingsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly provisioning: CrmProvisioningService,
    private readonly references: CrmReferenceService,
  ) {}

  listTags(principal: Principal) {
    return this.database.db
      .select()
      .from(tags)
      .where(eq(tags.organizationId, principal.organizationId))
      .orderBy(asc(tags.name));
  }

  async createTag(principal: Principal, dto: CreateTagDto) {
    const [tag] = await this.database.db
      .insert(tags)
      .values({
        organizationId: principal.organizationId,
        name: dto.name.trim(),
        color: dto.color?.trim(),
      })
      .onConflictDoUpdate({
        target: [tags.organizationId, tags.name],
        set: { color: dto.color?.trim(), updatedAt: new Date() },
      })
      .returning();

    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      actorType: 'USER',
      actorId: principal.userId,
      action: 'crm.tag.upsert',
      resourceType: 'tag',
      resourceId: tag.id,
      after: tag,
    });
    return tag;
  }

  listCustomFields(principal: Principal, objectType?: string) {
    const filter = objectType
      ? and(
          eq(customFieldDefinitions.organizationId, principal.organizationId),
          eq(customFieldDefinitions.objectType, objectType),
        )
      : eq(customFieldDefinitions.organizationId, principal.organizationId);

    return this.database.db
      .select()
      .from(customFieldDefinitions)
      .where(filter)
      .orderBy(
        asc(customFieldDefinitions.objectType),
        asc(customFieldDefinitions.position),
      );
  }

  async createCustomField(
    principal: Principal,
    dto: CreateCustomFieldDto,
  ) {
    return this.database.db.transaction(async (tx) => {
      const [field] = await tx
        .insert(customFieldDefinitions)
        .values({
          organizationId: principal.organizationId,
          objectType: dto.objectType,
          key: dto.key,
          label: dto.label.trim(),
          dataType: dto.dataType,
          isRequired: dto.isRequired ?? false,
          position: dto.position ?? 0,
          config: dto.config,
        })
        .returning();

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'crm.custom_field.created.v1',
        aggregateType: 'custom_field',
        aggregateId: field.id,
        payload: {
          fieldId: field.id,
          objectType: field.objectType,
          key: field.key,
        },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'crm.custom_field.create',
        resourceType: 'custom_field',
        resourceId: field.id,
        after: field,
      });
      return field;
    });
  }

  async setCustomFieldValue(
    principal: Principal,
    objectType: string,
    objectId: string,
    dto: SetCustomFieldValueDto,
  ) {
    const fields = await this.database.db
      .select()
      .from(customFieldDefinitions)
      .where(
        and(
          eq(customFieldDefinitions.organizationId, principal.organizationId),
          eq(customFieldDefinitions.id, dto.fieldId),
          eq(customFieldDefinitions.objectType, objectType),
        ),
      )
      .limit(1);
    const field = fields[0];
    if (!field) throw new NotFoundException('Custom field not found.');

    if (objectType === 'CONTACT') {
      await this.references.contact(principal.organizationId, objectId);
    } else if (objectType === 'COMPANY') {
      await this.references.company(principal.organizationId, objectId);
    } else if (objectType === 'LEAD') {
      await this.references.lead(principal.organizationId, objectId);
    } else if (objectType === 'DEAL') {
      await this.references.deal(principal.organizationId, objectId);
    } else {
      throw new NotFoundException('CRM object not found.');
    }

    const [value] = await this.database.db
      .insert(customFieldValues)
      .values({
        organizationId: principal.organizationId,
        fieldId: field.id,
        objectType,
        objectId,
        value: dto.value,
      })
      .onConflictDoUpdate({
        target: [
          customFieldValues.organizationId,
          customFieldValues.objectType,
          customFieldValues.objectId,
          customFieldValues.fieldId,
        ],
        set: { value: dto.value, updatedAt: new Date() },
      })
      .returning();

    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      actorType: 'USER',
      actorId: principal.userId,
      action: 'crm.custom_field.value_set',
      resourceType: objectType.toLowerCase(),
      resourceId: objectId,
      metadata: { fieldId: field.id, fieldKey: field.key },
    });
    return value;
  }

  async listSavedLists(principal: Principal, objectType?: string) {
    const filter = objectType
      ? and(
          eq(savedLists.organizationId, principal.organizationId),
          eq(savedLists.objectType, objectType),
        )
      : eq(savedLists.organizationId, principal.organizationId);
    return this.database.db
      .select()
      .from(savedLists)
      .where(filter)
      .orderBy(desc(savedLists.createdAt));
  }

  async createSavedList(principal: Principal, dto: CreateSavedListDto) {
    const workspaceId = await this.provisioning.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );

    return this.database.db.transaction(async (tx) => {
      const [list] = await tx
        .insert(savedLists)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          createdByMemberId: principal.membershipId,
          objectType: dto.objectType,
          name: dto.name.trim(),
          listType: dto.listType ?? 'DYNAMIC',
          filters: dto.filters,
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'crm.list.created.v1',
        aggregateType: 'saved_list',
        aggregateId: list.id,
        payload: {
          listId: list.id,
          objectType: list.objectType,
          listType: list.listType,
        },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'crm.list.create',
        resourceType: 'saved_list',
        resourceId: list.id,
        after: list,
      });
      return list;
    });
  }
}
