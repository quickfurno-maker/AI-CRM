import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import { auditLogs, outboxEvents } from '../../platform/database/schema.js';
import {
  companies,
  contacts,
  customFieldDefinitions,
  customFieldValues,
  deals,
  leads,
  savedListMembers,
  savedLists,
} from './crm.schema.js';
import {
  crmDataJobRows,
  crmDataJobs,
  leadScoringRules,
} from './crm-maturity.schema.js';
import {
  compare,
  CRM_FILTER_OPERATORS,
  evaluateFilterTree,
  filterFields,
  validateFilterTree,
  type CrmFilterOperator,
} from './crm-filter.js';
import { CrmProvisioningService } from './crm-provisioning.service.js';
import { CrmScopeService } from './crm-scope.service.js';
import type {
  CreateCrmExportJobDto,
  CreateCrmImportJobDto,
  CreateLeadScoringRuleDto,
  UpdateLeadScoringRuleDto,
} from './dto/crm.dto.js';

const DIRECT_FIELDS: Record<string, Set<string>> = {
  CONTACT: new Set([
    'id',
    'displayName',
    'firstName',
    'lastName',
    'email',
    'phone',
    'source',
    'lifecycleStage',
    'status',
    'ownerMemberId',
    'workspaceId',
    'createdAt',
  ]),
  COMPANY: new Set([
    'id',
    'name',
    'domain',
    'website',
    'phone',
    'industry',
    'status',
    'ownerMemberId',
    'workspaceId',
    'createdAt',
  ]),
  LEAD: new Set([
    'id',
    'title',
    'source',
    'status',
    'temperature',
    'score',
    'estimatedValue',
    'currency',
    'expectedCloseDate',
    'ownerMemberId',
    'workspaceId',
    'createdAt',
  ]),
  DEAL: new Set([
    'id',
    'name',
    'amount',
    'currency',
    'status',
    'probability',
    'expectedCloseDate',
    'ownerMemberId',
    'workspaceId',
    'createdAt',
  ]),
};

@Injectable()
export class CrmMaturityService {
  constructor(
    private readonly database: DatabaseService,
    private readonly provisioning: CrmProvisioningService,
    private readonly scope: CrmScopeService,
  ) {}

  async evaluateSavedList(
    principal: Principal,
    listId: string,
    limit = 100,
  ) {
    const list = await this.getSavedList(principal.organizationId, listId);
    if (list.status !== 'ACTIVE') {
      throw new ConflictException('Archived saved lists cannot be evaluated.');
    }
    await this.assertListWorkspace(principal, list.workspaceId);

    const boundedLimit = Math.min(Math.max(limit, 1), 1000);
    const rows = await this.readObjects(
      principal,
      list.objectType,
      list.workspaceId,
      5000,
    );

    if (list.listType === 'STATIC') {
      const members = await this.database.db
        .select({ objectId: savedListMembers.objectId })
        .from(savedListMembers)
        .where(eq(savedListMembers.listId, listId));
      const allowed = new Set(members.map((member) => member.objectId));
      const items = rows.filter((row) => allowed.has(String(row.id)));
      return {
        list,
        count: items.length,
        items: items.slice(0, boundedLimit),
        truncated: items.length > boundedLimit,
      };
    }

    let tree;
    try {
      tree = validateFilterTree(
        list.filters ?? { op: 'AND', rules: [] },
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Saved-list filter is invalid.',
      );
    }

    const fields = filterFields(tree);
    const direct = DIRECT_FIELDS[list.objectType];
    if (!direct) throw new BadRequestException('Unsupported saved-list object type.');

    const customKeys = fields
      .filter((field) => field.startsWith('custom.'))
      .map((field) => field.slice('custom.'.length));
    const invalidDirect = fields.filter(
      (field) => !field.startsWith('custom.') && !direct.has(field),
    );
    if (invalidDirect.length) {
      throw new BadRequestException(
        `Unsupported filter field(s): ${invalidDirect.join(', ')}.`,
      );
    }

    const customDefinitions = customKeys.length
      ? await this.database.db
          .select({
            id: customFieldDefinitions.id,
            key: customFieldDefinitions.key,
          })
          .from(customFieldDefinitions)
          .where(
            and(
              eq(
                customFieldDefinitions.organizationId,
                principal.organizationId,
              ),
              eq(customFieldDefinitions.objectType, list.objectType),
              eq(customFieldDefinitions.status, 'ACTIVE'),
              inArray(customFieldDefinitions.key, [...new Set(customKeys)]),
            ),
          )
      : [];
    if (
      new Set(customDefinitions.map((field) => field.key)).size !==
      new Set(customKeys).size
    ) {
      throw new BadRequestException(
        'Saved list references an unknown or archived custom field.',
      );
    }

    const customByObject = await this.loadCustomValues(
      principal.organizationId,
      list.objectType,
      rows.map((row) => String(row.id)),
      customDefinitions,
    );

    const items = rows.filter((row) =>
      evaluateFilterTree(
        tree,
        row,
        customByObject.get(String(row.id)) ?? {},
      ),
    );

    return {
      list,
      count: items.length,
      items: items.slice(0, boundedLimit),
      truncated: items.length > boundedLimit,
    };
  }

  async listScoringRules(principal: Principal, workspaceId?: string) {
    const resolved = workspaceId
      ? await this.provisioning.resolveWorkspace(
          principal.organizationId,
          workspaceId,
        )
      : undefined;
    return this.database.db
      .select()
      .from(leadScoringRules)
      .where(
        resolved
          ? and(
              eq(leadScoringRules.organizationId, principal.organizationId),
              eq(leadScoringRules.workspaceId, resolved),
            )
          : eq(leadScoringRules.organizationId, principal.organizationId),
      )
      .orderBy(
        desc(leadScoringRules.priority),
        asc(leadScoringRules.createdAt),
      );
  }

  async createScoringRule(
    principal: Principal,
    dto: CreateLeadScoringRuleDto,
  ) {
    this.assertScoringField(dto.field);
    const workspaceId = await this.provisioning.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    await this.assertListWorkspace(principal, workspaceId);

    const [rule] = await this.database.db
      .insert(leadScoringRules)
      .values({
        organizationId: principal.organizationId,
        workspaceId,
        name: dto.name.trim(),
        field: dto.field,
        operator: dto.operator,
        comparisonValue: dto.comparisonValue,
        points: dto.points,
        decayDays: dto.decayDays,
        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
      })
      .returning();

    await this.audit(
      principal,
      workspaceId,
      'crm.scoring_rule.create',
      'lead_scoring_rule',
      rule.id,
      rule,
    );
    return rule;
  }

  async updateScoringRule(
    principal: Principal,
    ruleId: string,
    dto: UpdateLeadScoringRuleDto,
  ) {
    const rows = await this.database.db
      .select()
      .from(leadScoringRules)
      .where(
        and(
          eq(leadScoringRules.organizationId, principal.organizationId),
          eq(leadScoringRules.id, ruleId),
        ),
      )
      .limit(1);
    const before = rows[0];
    if (!before) throw new NotFoundException('Lead scoring rule not found.');
    await this.assertListWorkspace(principal, before.workspaceId);
    if (dto.field) this.assertScoringField(dto.field);

    const [updated] = await this.database.db
      .update(leadScoringRules)
      .set({
        name: dto.name?.trim(),
        field: dto.field,
        operator: dto.operator,
        comparisonValue: dto.comparisonValue,
        points: dto.points,
        decayDays: dto.decayDays,
        priority: dto.priority,
        isActive: dto.isActive,
        updatedAt: new Date(),
      })
      .where(eq(leadScoringRules.id, ruleId))
      .returning();

    await this.audit(
      principal,
      before.workspaceId,
      'crm.scoring_rule.update',
      'lead_scoring_rule',
      ruleId,
      updated,
      before,
    );
    return updated;
  }

  async recalculateLeadScore(principal: Principal, leadId: string) {
    const leadRows = await this.database.db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.organizationId, principal.organizationId),
          eq(leads.id, leadId),
        ),
      )
      .limit(1);
    const lead = leadRows[0];
    if (!lead) throw new NotFoundException('Lead not found.');
    const scopeContext = await this.scope.resolve(principal);
    if (!this.scope.canReadRow(scopeContext, lead)) {
      throw new NotFoundException('Lead not found.');
    }

    const rules = await this.database.db
      .select()
      .from(leadScoringRules)
      .where(
        and(
          eq(leadScoringRules.organizationId, principal.organizationId),
          eq(leadScoringRules.workspaceId, lead.workspaceId),
          eq(leadScoringRules.isActive, true),
        ),
      )
      .orderBy(
        desc(leadScoringRules.priority),
        asc(leadScoringRules.createdAt),
      );

    const customKeys = rules
      .filter((rule) => rule.field.startsWith('custom.'))
      .map((rule) => rule.field.slice('custom.'.length));
    const definitions = customKeys.length
      ? await this.database.db
          .select({
            id: customFieldDefinitions.id,
            key: customFieldDefinitions.key,
          })
          .from(customFieldDefinitions)
          .where(
            and(
              eq(
                customFieldDefinitions.organizationId,
                principal.organizationId,
              ),
              eq(customFieldDefinitions.objectType, 'LEAD'),
              eq(customFieldDefinitions.status, 'ACTIVE'),
              inArray(customFieldDefinitions.key, [...new Set(customKeys)]),
            ),
          )
      : [];
    const customByObject = await this.loadCustomValues(
      principal.organizationId,
      'LEAD',
      [lead.id],
      definitions,
    );
    const custom = customByObject.get(lead.id) ?? {};

    const ageDays = Math.max(
      0,
      Math.floor((Date.now() - lead.createdAt.getTime()) / 86_400_000),
    );
    let rawScore = 0;
    const explanation = rules.map((rule) => {
      const operator = rule.operator as CrmFilterOperator;
      const validOperator = CRM_FILTER_OPERATORS.includes(operator);
      const actual = rule.field.startsWith('custom.')
        ? custom[rule.field.slice('custom.'.length)]
        : (lead as unknown as Record<string, unknown>)[rule.field];
      const decayed = Boolean(
        rule.decayDays && ageDays > rule.decayDays,
      );
      const matched =
        validOperator &&
        !decayed &&
        compare(actual, operator, rule.comparisonValue);
      const points = matched ? rule.points : 0;
      rawScore += points;
      return {
        ruleId: rule.id,
        name: rule.name,
        field: rule.field,
        operator: rule.operator,
        expected: rule.comparisonValue,
        actual,
        matched,
        decayed,
        points,
      };
    });

    const score = Math.min(100, Math.max(0, rawScore));
    const [updated] = await this.database.db
      .update(leads)
      .set({ score, updatedAt: new Date() })
      .where(eq(leads.id, lead.id))
      .returning();

    await this.database.db.transaction(async (tx) => {
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: lead.workspaceId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'crm.lead.score_recalculate',
        resourceType: 'lead',
        resourceId: lead.id,
        before: { score: lead.score },
        after: { score },
        metadata: { explanation },
      });
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'crm.lead.score_changed.v1',
        aggregateType: 'lead',
        aggregateId: lead.id,
        payload: {
          leadId: lead.id,
          previousScore: lead.score,
          score,
          explanation,
        },
      });
    });

    return { lead: updated, score, rawScore, explanation };
  }

  async createImportJob(
    principal: Principal,
    dto: CreateCrmImportJobDto,
  ) {
    if (!dto.rows.length) {
      throw new BadRequestException('Import must contain at least one row.');
    }
    const workspaceId = await this.provisioning.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    await this.scope.assertAssignment(
      principal,
      principal.membershipId,
      workspaceId,
    );

    if (dto.objectType === 'LEAD') {
      await this.provisioning.ensureDefaultPipelines(
        principal.organizationId,
        workspaceId,
      );
    }

    const job = await this.database.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(crmDataJobs)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          requestedByMemberId: principal.membershipId,
          direction: 'IMPORT',
          objectType: dto.objectType,
          duplicateStrategy: dto.duplicateStrategy ?? 'SKIP',
          mapping: dto.mapping,
          totalRows: dto.rows.length,
        })
        .returning();

      for (let start = 0; start < dto.rows.length; start += 500) {
        const chunk = dto.rows.slice(start, start + 500);
        await tx.insert(crmDataJobRows).values(
          chunk.map((input, offset) => ({
            organizationId: principal.organizationId,
            jobId: created.id,
            rowNumber: start + offset + 1,
            input,
          })),
        );
      }

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'crm.data_import.requested.v1',
        aggregateType: 'crm_data_job',
        aggregateId: created.id,
        payload: {
          jobId: created.id,
          objectType: created.objectType,
          totalRows: created.totalRows,
        },
      });
      return created;
    });

    await this.audit(
      principal,
      workspaceId,
      'crm.data_import.create',
      'crm_data_job',
      job.id,
      job,
    );
    return job;
  }

  async createExportJob(
    principal: Principal,
    dto: CreateCrmExportJobDto,
  ) {
    const workspaceId = await this.provisioning.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    const scopeContext = await this.scope.resolve(principal);
    await this.assertListWorkspace(principal, workspaceId);

    const [job] = await this.database.db
      .insert(crmDataJobs)
      .values({
        organizationId: principal.organizationId,
        workspaceId,
        requestedByMemberId: principal.membershipId,
        direction: 'EXPORT',
        objectType: dto.objectType,
        columns: dto.columns,
        filter: {
          requested: dto.filter ?? {},
          scopeSnapshot: scopeContext,
        },
      })
      .returning();

    await this.database.db.insert(outboxEvents).values({
      organizationId: principal.organizationId,
      eventType: 'crm.data_export.requested.v1',
      aggregateType: 'crm_data_job',
      aggregateId: job.id,
      payload: { jobId: job.id, objectType: job.objectType },
    });
    await this.audit(
      principal,
      workspaceId,
      'crm.data_export.create',
      'crm_data_job',
      job.id,
      job,
    );
    return job;
  }

  listDataJobs(principal: Principal) {
    return this.database.db
      .select()
      .from(crmDataJobs)
      .where(eq(crmDataJobs.organizationId, principal.organizationId))
      .orderBy(desc(crmDataJobs.createdAt))
      .limit(100);
  }

  async getDataJob(principal: Principal, jobId: string) {
    const rows = await this.database.db
      .select()
      .from(crmDataJobs)
      .where(
        and(
          eq(crmDataJobs.organizationId, principal.organizationId),
          eq(crmDataJobs.id, jobId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('CRM data job not found.');
    return rows[0];
  }

  async getDataJobRows(
    principal: Principal,
    jobId: string,
    limit = 5000,
  ) {
    await this.getDataJob(principal, jobId);
    return this.database.db
      .select()
      .from(crmDataJobRows)
      .where(
        and(
          eq(crmDataJobRows.organizationId, principal.organizationId),
          eq(crmDataJobRows.jobId, jobId),
        ),
      )
      .orderBy(asc(crmDataJobRows.rowNumber))
      .limit(Math.min(Math.max(limit, 1), 5000));
  }

  private async readObjects(
    principal: Principal,
    objectType: string,
    workspaceId: string,
    limit: number,
  ): Promise<Array<Record<string, unknown> & { id: string }>> {
    const context = await this.scope.resolve(principal);
    let rows: Array<Record<string, unknown> & { id: string }>;

    if (objectType === 'CONTACT') {
      rows = (await this.database.db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.organizationId, principal.organizationId),
            eq(contacts.workspaceId, workspaceId),
          ),
        )
        .orderBy(desc(contacts.createdAt))
        .limit(limit)) as unknown as Array<Record<string, unknown> & { id: string }>;
    } else if (objectType === 'COMPANY') {
      rows = (await this.database.db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.organizationId, principal.organizationId),
            eq(companies.workspaceId, workspaceId),
          ),
        )
        .orderBy(desc(companies.createdAt))
        .limit(limit)) as unknown as Array<Record<string, unknown> & { id: string }>;
    } else if (objectType === 'LEAD') {
      rows = (await this.database.db
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.organizationId, principal.organizationId),
            eq(leads.workspaceId, workspaceId),
          ),
        )
        .orderBy(desc(leads.createdAt))
        .limit(limit)) as unknown as Array<Record<string, unknown> & { id: string }>;
    } else if (objectType === 'DEAL') {
      rows = (await this.database.db
        .select()
        .from(deals)
        .where(
          and(
            eq(deals.organizationId, principal.organizationId),
            eq(deals.workspaceId, workspaceId),
          ),
        )
        .orderBy(desc(deals.createdAt))
        .limit(limit)) as unknown as Array<Record<string, unknown> & { id: string }>;
    } else {
      throw new BadRequestException('Unsupported CRM object type.');
    }

    return rows.filter((row) =>
      this.scope.canReadRow(context, {
        ownerMemberId:
          typeof row.ownerMemberId === 'string'
            ? row.ownerMemberId
            : null,
        workspaceId:
          typeof row.workspaceId === 'string' ? row.workspaceId : null,
      }),
    );
  }

  private async loadCustomValues(
    organizationId: string,
    objectType: string,
    objectIds: string[],
    definitions: Array<{ id: string; key: string }>,
  ) {
    const result = new Map<string, Record<string, unknown>>();
    if (!objectIds.length || !definitions.length) return result;

    const rows = await this.database.db
      .select({
        objectId: customFieldValues.objectId,
        fieldId: customFieldValues.fieldId,
        value: customFieldValues.value,
      })
      .from(customFieldValues)
      .where(
        and(
          eq(customFieldValues.organizationId, organizationId),
          eq(customFieldValues.objectType, objectType),
          inArray(customFieldValues.objectId, objectIds),
          inArray(
            customFieldValues.fieldId,
            definitions.map((field) => field.id),
          ),
        ),
      );

    const keyById = new Map(
      definitions.map((definition) => [definition.id, definition.key]),
    );
    for (const row of rows) {
      const key = keyById.get(row.fieldId);
      if (!key) continue;
      const values = result.get(row.objectId) ?? {};
      values[key] = row.value;
      result.set(row.objectId, values);
    }
    return result;
  }

  private assertScoringField(field: string) {
    if (!DIRECT_FIELDS.LEAD.has(field) && !field.startsWith('custom.')) {
      throw new BadRequestException(
        'Lead scoring field is not supported.',
      );
    }
    if (field.startsWith('custom.') && field.length <= 'custom.'.length) {
      throw new BadRequestException('Custom scoring field key is missing.');
    }
  }

  private async assertListWorkspace(
    principal: Principal,
    workspaceId: string,
  ) {
    const context = await this.scope.resolve(principal);
    if (
      context.scope === 'WORKSPACE' &&
      context.workspaceId !== workspaceId
    ) {
      throw new ForbiddenException(
        'Workspace is outside the current permission scope.',
      );
    }
    if (
      context.scope === 'BRANCH' &&
      !context.branchId
    ) {
      throw new ForbiddenException(
        'Branch-scoped user has no active branch placement.',
      );
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

  private async audit(
    principal: Principal,
    workspaceId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    after: Record<string, unknown>,
    before?: Record<string, unknown>,
  ) {
    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      workspaceId,
      actorType: principal.actorType ?? 'USER',
      actorId: principal.actorId ?? principal.userId,
      action,
      resourceType,
      resourceId,
      before,
      after,
    });
  }
}
