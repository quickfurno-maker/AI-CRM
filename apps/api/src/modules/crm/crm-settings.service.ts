import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import { auditLogs, outboxEvents } from '../../platform/database/schema.js';
import {
  customFieldDefinitions,
  customFieldValues,
  savedListMembers,
  savedLists,
  tags,
} from './crm.schema.js';
import { validateFilterTree } from './crm-filter.js';
import { CrmProvisioningService } from './crm-provisioning.service.js';
import { CrmReferenceService } from './crm-reference.service.js';
import { CrmScopeService } from './crm-scope.service.js';
import type {
  CreateCustomFieldDto,
  CreateSavedListDto,
  CreateTagDto,
  SetCustomFieldValueDto,
  SetSavedListMembersDto,
  UpdateCustomFieldDto,
  UpdateSavedListDto,
} from './dto/crm.dto.js';

@Injectable()
export class CrmSettingsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly provisioning: CrmProvisioningService,
    private readonly references: CrmReferenceService,
    private readonly scope: CrmScopeService,
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
    this.validateFieldConfiguration(dto.dataType, dto.config);

    return this.database.db.transaction(async (tx) => {
      const [field] = await tx
        .insert(customFieldDefinitions)
        .values({
          organizationId: principal.organizationId,
          objectType: dto.objectType,
          key: dto.key,
          label: dto.label.trim(),
          dataType: dto.dataType,
          groupName: dto.groupName?.trim(),
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

  async updateCustomField(
    principal: Principal,
    fieldId: string,
    dto: UpdateCustomFieldDto,
  ) {
    const rows = await this.database.db
      .select()
      .from(customFieldDefinitions)
      .where(
        and(
          eq(customFieldDefinitions.organizationId, principal.organizationId),
          eq(customFieldDefinitions.id, fieldId),
        ),
      )
      .limit(1);
    const before = rows[0];
    if (!before) throw new NotFoundException('Custom field not found.');

    const nextConfig = dto.config ?? before.config ?? undefined;
    this.validateFieldConfiguration(before.dataType, nextConfig);

    return this.database.db.transaction(async (tx) => {
      const [field] = await tx
        .update(customFieldDefinitions)
        .set({
          label: dto.label?.trim(),
          groupName: dto.groupName?.trim(),
          isRequired: dto.isRequired,
          position: dto.position,
          status: dto.status,
          config: dto.config,
          updatedAt: new Date(),
        })
        .where(eq(customFieldDefinitions.id, fieldId))
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: 'USER',
        actorId: principal.userId,
        action:
          dto.status === 'ARCHIVED'
            ? 'crm.custom_field.archive'
            : 'crm.custom_field.update',
        resourceType: 'custom_field',
        resourceId: field.id,
        before,
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
    if (field.status !== 'ACTIVE') {
      throw new ConflictException('Archived custom fields cannot be changed.');
    }

    await this.assertObjectExists(principal, objectType, objectId);
    await this.scope.assertObjectAccess(
      principal,
      objectType as 'CONTACT' | 'COMPANY' | 'LEAD' | 'DEAL',
      objectId,
    );
    this.validateFieldValue(field, dto.value);

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
      actorType: principal.actorType ?? 'USER',
      actorId: principal.actorId ?? principal.userId,
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
    await this.scope.assertAssignment(
      principal,
      principal.membershipId,
      workspaceId,
    );

    const listType = dto.listType ?? 'DYNAMIC';
    const filters =
      listType === 'DYNAMIC'
        ? this.validateListFilter(dto.filters)
        : undefined;

    return this.database.db.transaction(async (tx) => {
      const [list] = await tx
        .insert(savedLists)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          createdByMemberId: principal.membershipId,
          objectType: dto.objectType,
          name: dto.name.trim(),
          listType,
          filters,
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

  async updateSavedList(
    principal: Principal,
    listId: string,
    dto: UpdateSavedListDto,
  ) {
    const before = await this.getSavedList(principal.organizationId, listId);
    const filters =
      dto.filters === undefined
        ? undefined
        : before.listType === 'DYNAMIC'
          ? this.validateListFilter(dto.filters)
          : (() => {
              throw new BadRequestException(
                'Static lists do not accept dynamic filters.',
              );
            })();

    const [updated] = await this.database.db
      .update(savedLists)
      .set({
        name: dto.name?.trim(),
        status: dto.status,
        filters,
        updatedAt: new Date(),
      })
      .where(eq(savedLists.id, listId))
      .returning();

    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      workspaceId: before.workspaceId,
      actorType: 'USER',
      actorId: principal.userId,
      action:
        dto.status === 'ARCHIVED' ? 'crm.list.archive' : 'crm.list.update',
      resourceType: 'saved_list',
      resourceId: listId,
      before,
      after: updated,
    });
    return updated;
  }

  async listSavedListMembers(principal: Principal, listId: string) {
    const list = await this.getSavedList(principal.organizationId, listId);
    if (list.listType !== 'STATIC') {
      throw new BadRequestException('Only static lists have stored members.');
    }
    return this.database.db
      .select()
      .from(savedListMembers)
      .where(eq(savedListMembers.listId, listId))
      .orderBy(asc(savedListMembers.createdAt));
  }

  async setSavedListMembers(
    principal: Principal,
    listId: string,
    dto: SetSavedListMembersDto,
  ) {
    const list = await this.getSavedList(principal.organizationId, listId);
    if (list.status !== 'ACTIVE') {
      throw new ConflictException('Archived lists cannot be modified.');
    }
    if (list.listType !== 'STATIC') {
      throw new BadRequestException(
        'Stored membership is available only for static lists.',
      );
    }

    const objectIds = [...new Set(dto.objectIds)];
    for (let start = 0; start < objectIds.length; start += 50) {
      const chunk = objectIds.slice(start, start + 50);
      await Promise.all(
        chunk.map(async (objectId) => {
          await this.assertObjectExists(principal, list.objectType, objectId);
          await this.scope.assertObjectAccess(
            principal,
            list.objectType as 'CONTACT' | 'COMPANY' | 'LEAD' | 'DEAL',
            objectId,
          );
        }),
      );
    }

    await this.database.db.transaction(async (tx) => {
      await tx
        .delete(savedListMembers)
        .where(eq(savedListMembers.listId, listId));
      if (objectIds.length) {
        await tx.insert(savedListMembers).values(
          objectIds.map((objectId) => ({
            organizationId: principal.organizationId,
            listId,
            objectId,
          })),
        );
      }
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: list.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'crm.list.members_set',
        resourceType: 'saved_list',
        resourceId: listId,
        after: { objectIds },
      });
    });

    return this.listSavedListMembers(principal, listId);
  }

  private async assertObjectExists(
    principal: Principal,
    objectType: string,
    objectId: string,
  ) {
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
  }

  private async getSavedList(organizationId: string, listId: string) {
    const rows = await this.database.db
      .select()
      .from(savedLists)
      .where(
        and(
          eq(savedLists.organizationId, organizationId),
          eq(savedLists.id, listId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Saved list not found.');
    return rows[0];
  }

  private validateListFilter(filters?: Record<string, unknown>) {
    try {
      return validateFilterTree(
        filters ?? { op: 'AND', rules: [] },
      ) as unknown as Record<string, unknown>;
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid saved-list filter.',
      );
    }
  }

  private validateFieldConfiguration(
    dataType: string,
    config?: Record<string, unknown>,
  ) {
    if (dataType === 'SELECT' || dataType === 'MULTI_SELECT') {
      const options = config?.options;
      if (
        !Array.isArray(options) ||
        options.length < 1 ||
        options.length > 200 ||
        options.some(
          (option) =>
            typeof option !== 'string' ||
            !option.trim() ||
            option.length > 160,
        )
      ) {
        throw new BadRequestException(
          'Select fields require 1–200 string options.',
        );
      }
      if (new Set(options.map((value) => value.toLocaleLowerCase())).size !== options.length) {
        throw new BadRequestException('Select-field options must be unique.');
      }
    }

    if (dataType === 'NUMBER' && config) {
      const min = config.min;
      const max = config.max;
      if (
        min !== undefined &&
        (typeof min !== 'number' || !Number.isFinite(min))
      ) {
        throw new BadRequestException('Number-field min must be numeric.');
      }
      if (
        max !== undefined &&
        (typeof max !== 'number' || !Number.isFinite(max))
      ) {
        throw new BadRequestException('Number-field max must be numeric.');
      }
      if (
        typeof min === 'number' &&
        typeof max === 'number' &&
        min > max
      ) {
        throw new BadRequestException(
          'Number-field min cannot exceed max.',
        );
      }
    }
  }

  private validateFieldValue(
    field: typeof customFieldDefinitions.$inferSelect,
    value: unknown,
  ) {
    const empty =
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (empty) {
      if (field.isRequired) {
        throw new BadRequestException(
          `${field.label} is a required custom field.`,
        );
      }
      return;
    }

    const config = field.config ?? {};
    if (field.dataType === 'TEXT') {
      if (typeof value !== 'string') {
        throw new BadRequestException(`${field.label} must be text.`);
      }
      const maxLength =
        typeof config.maxLength === 'number' ? config.maxLength : 5000;
      if (value.length > maxLength) {
        throw new BadRequestException(
          `${field.label} exceeds its maximum length.`,
        );
      }
      return;
    }

    if (field.dataType === 'NUMBER') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequestException(`${field.label} must be a number.`);
      }
      if (typeof config.min === 'number' && value < config.min) {
        throw new BadRequestException(`${field.label} is below minimum.`);
      }
      if (typeof config.max === 'number' && value > config.max) {
        throw new BadRequestException(`${field.label} exceeds maximum.`);
      }
      return;
    }

    if (field.dataType === 'BOOLEAN') {
      if (typeof value !== 'boolean') {
        throw new BadRequestException(`${field.label} must be boolean.`);
      }
      return;
    }

    if (field.dataType === 'DATE') {
      if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(`${value}T00:00:00Z`))
      ) {
        throw new BadRequestException(
          `${field.label} must be an ISO date (YYYY-MM-DD).`,
        );
      }
      return;
    }

    const options = Array.isArray(config.options)
      ? config.options.filter((option): option is string => typeof option === 'string')
      : [];

    if (field.dataType === 'SELECT') {
      if (typeof value !== 'string' || !options.includes(value)) {
        throw new BadRequestException(
          `${field.label} must use a configured option.`,
        );
      }
      return;
    }

    if (
      !Array.isArray(value) ||
      value.length > 100 ||
      value.some(
        (item) => typeof item !== 'string' || !options.includes(item),
      )
    ) {
      throw new BadRequestException(
        `${field.label} must use configured options.`,
      );
    }
  }
}
