import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  auditLogs,
  outboxEvents,
} from '../../platform/database/schema.js';
import {
  deals,
  leads,
} from './crm.schema.js';
import { CrmProvisioningService } from './crm-provisioning.service.js';
import { CrmReferenceService } from './crm-reference.service.js';
import type {
  CreateDealDto,
  CreateLeadDto,
  ListQueryDto,
  UpdateDealDto,
  UpdateLeadDto,
} from './dto/crm.dto.js';

@Injectable()
export class SalesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly provisioning: CrmProvisioningService,
    private readonly references: CrmReferenceService,
  ) {}

  async pipelines(
    principal: Principal,
    objectType: 'LEAD' | 'DEAL',
    workspaceId?: string,
  ) {
    const resolvedWorkspace = await this.provisioning.resolveWorkspace(
      principal.organizationId,
      workspaceId,
    );
    return this.provisioning.getDefaultPipeline(
      principal.organizationId,
      resolvedWorkspace,
      objectType,
    );
  }

  async listLeads(principal: Principal, query: ListQueryDto) {
    const filter = query.search?.trim()
      ? and(
          eq(leads.organizationId, principal.organizationId),
          ilike(leads.title, `%${query.search.trim()}%`),
        )
      : eq(leads.organizationId, principal.organizationId);

    return this.database.db
      .select()
      .from(leads)
      .where(filter)
      .orderBy(desc(leads.createdAt))
      .limit(query.limit);
  }

  async getLead(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.organizationId, principal.organizationId),
          eq(leads.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Lead not found.');
    return rows[0];
  }

  async createLead(principal: Principal, dto: CreateLeadDto) {
    const workspaceId = await this.provisioning.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    const ownerMemberId = await this.provisioning.assertMember(
      principal.organizationId,
      dto.ownerMemberId ?? principal.membershipId,
    );
    const [contactId, companyId, pipeline] = await Promise.all([
      this.references.contact(principal.organizationId, dto.contactId),
      this.references.company(principal.organizationId, dto.companyId),
      this.provisioning.getDefaultPipeline(
        principal.organizationId,
        workspaceId,
        'LEAD',
      ),
    ]);
    const stage = pipeline.stages[0];
    if (!stage) throw new Error('Lead pipeline has no stage.');
    return this.database.db.transaction(async (tx) => {
      const [lead] = await tx
        .insert(leads)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          contactId,
          companyId,
          ownerMemberId,
          pipelineId: pipeline.id,
          stageId: stage.id,
          title: dto.title.trim(),
          source: dto.source?.trim(),
          temperature: dto.temperature ?? 'COLD',
          score: dto.score ?? 0,
          estimatedValue: dto.estimatedValue,
          currency: dto.currency ?? 'INR',
          expectedCloseDate: dto.expectedCloseDate,
        })
        .returning();

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'crm.lead.created.v1',
        aggregateType: 'lead',
        aggregateId: lead.id,
        payload: {
          leadId: lead.id,
          contactId,
          companyId,
          stageId: stage.id,
          source: lead.source,
        },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'crm.lead.create',
        resourceType: 'lead',
        resourceId: lead.id,
        after: lead,
      });
      return lead;
    });
  }

  async updateLead(principal: Principal, id: string, dto: UpdateLeadDto) {
    const before = await this.getLead(principal, id);
    const ownerMemberId =
      dto.ownerMemberId === undefined
        ? before.ownerMemberId
        : await this.provisioning.assertMember(
            principal.organizationId,
            dto.ownerMemberId,
          );

    const stage = dto.stageId
      ? await this.references.stage(
          principal.organizationId,
          before.pipelineId,
          dto.stageId,
        )
      : undefined;
    let status = dto.status;
    let temperature = dto.temperature;
    if (stage && dto.status === undefined) {
      if (stage.key === 'qualified') status = 'QUALIFIED';
      else if (stage.key === 'unqualified') status = 'UNQUALIFIED';
      else if (stage.stageType === 'LOST') status = 'LOST';
      else status = 'OPEN';
    }
    if (stage?.stageType === 'LOST' && dto.temperature === undefined) {
      temperature = 'LOST';
    }

    return this.database.db.transaction(async (tx) => {
      const [lead] = await tx
        .update(leads)
        .set({
          ownerMemberId,
          stageId: dto.stageId,
          title: dto.title?.trim(),
          source: dto.source?.trim(),
          status,
          temperature,
          score: dto.score,
          estimatedValue: dto.estimatedValue,
          currency: dto.currency,
          expectedCloseDate: dto.expectedCloseDate,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(leads.organizationId, principal.organizationId),
            eq(leads.id, id),
          ),
        )
        .returning();

      const stageChanged = Boolean(dto.stageId && dto.stageId !== before.stageId);
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: stageChanged
          ? 'crm.lead.stage_changed.v1'
          : 'crm.lead.updated.v1',
        aggregateType: 'lead',
        aggregateId: lead.id,
        payload: {
          leadId: lead.id,
          previousStageId: before.stageId,
          stageId: lead.stageId,
          status: lead.status,
        },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: lead.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: stageChanged ? 'crm.lead.stage_change' : 'crm.lead.update',
        resourceType: 'lead',
        resourceId: lead.id,
        before,
        after: lead,
      });
      return lead;
    });
  }
  async listDeals(principal: Principal, query: ListQueryDto) {
    const filter = query.search?.trim()
      ? and(
          eq(deals.organizationId, principal.organizationId),
          ilike(deals.name, `%${query.search.trim()}%`),
        )
      : eq(deals.organizationId, principal.organizationId);

    return this.database.db
      .select()
      .from(deals)
      .where(filter)
      .orderBy(desc(deals.createdAt))
      .limit(query.limit);
  }

  async getDeal(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(deals)
      .where(
        and(
          eq(deals.organizationId, principal.organizationId),
          eq(deals.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Deal not found.');
    return rows[0];
  }

  async createDeal(principal: Principal, dto: CreateDealDto) {
    const workspaceId = await this.provisioning.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    const ownerMemberId = await this.provisioning.assertMember(
      principal.organizationId,
      dto.ownerMemberId ?? principal.membershipId,
    );
    const [contactId, companyId, leadId, pipeline] = await Promise.all([
      this.references.contact(principal.organizationId, dto.contactId),
      this.references.company(principal.organizationId, dto.companyId),
      this.references.lead(principal.organizationId, dto.leadId),
      this.provisioning.getDefaultPipeline(
        principal.organizationId,
        workspaceId,
        'DEAL',
      ),
    ]);
    const stage = pipeline.stages[0];
    if (!stage) throw new Error('Deal pipeline has no stage.');

    return this.database.db.transaction(async (tx) => {
      const [deal] = await tx
        .insert(deals)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          contactId,
          companyId,
          leadId,
          ownerMemberId,
          pipelineId: pipeline.id,
          stageId: stage.id,
          name: dto.name.trim(),
          amount: dto.amount,
          currency: dto.currency ?? 'INR',
          probability: dto.probability ?? stage.probability,
          expectedCloseDate: dto.expectedCloseDate,
        })
        .returning();

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'crm.deal.created.v1',
        aggregateType: 'deal',
        aggregateId: deal.id,
        payload: {
          dealId: deal.id,
          leadId,
          contactId,
          stageId: stage.id,
        },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'crm.deal.create',
        resourceType: 'deal',
        resourceId: deal.id,
        after: deal,
      });
      return deal;
    });
  }

  async updateDeal(principal: Principal, id: string, dto: UpdateDealDto) {
    const before = await this.getDeal(principal, id);
    const ownerMemberId =
      dto.ownerMemberId === undefined
        ? before.ownerMemberId
        : await this.provisioning.assertMember(
            principal.organizationId,
            dto.ownerMemberId,
          );
    const stage = dto.stageId
      ? await this.references.stage(
          principal.organizationId,
          before.pipelineId,
          dto.stageId,
        )
      : undefined;

    let status = dto.status;
    let closedAt: Date | null | undefined;
    if (stage && dto.status === undefined) {
      if (stage.stageType === 'WON') {
        status = 'WON';
        closedAt = new Date();
      } else if (stage.stageType === 'LOST') {
        status = 'LOST';
        closedAt = new Date();
      } else {
        status = 'OPEN';
        closedAt = null;
      }
    }

    return this.database.db.transaction(async (tx) => {
      const [deal] = await tx
        .update(deals)
        .set({
          ownerMemberId,
          stageId: dto.stageId,
          name: dto.name?.trim(),
          amount: dto.amount,
          currency: dto.currency,
          status,
          probability: dto.probability ?? stage?.probability,
          expectedCloseDate: dto.expectedCloseDate,
          closedAt,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(deals.organizationId, principal.organizationId),
            eq(deals.id, id),
          ),
        )
        .returning();

      const stageChanged = Boolean(dto.stageId && dto.stageId !== before.stageId);
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: stageChanged
          ? 'crm.deal.stage_changed.v1'
          : 'crm.deal.updated.v1',
        aggregateType: 'deal',
        aggregateId: deal.id,
        payload: {
          dealId: deal.id,
          previousStageId: before.stageId,
          stageId: deal.stageId,
          status: deal.status,
          amount: deal.amount,
        },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: deal.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: stageChanged ? 'crm.deal.stage_change' : 'crm.deal.update',
        resourceType: 'deal',
        resourceId: deal.id,
        before,
        after: deal,
      });
      return deal;
    });
  }
}
