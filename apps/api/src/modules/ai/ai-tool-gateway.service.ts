import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { tool } from '@openai/agents';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Principal } from '../../platform/auth/auth.types.js';
import { RealEstateService } from '../../extensions/real-estate/real-estate.service.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  auditLogs,
  outboxEvents,
} from '../../platform/database/schema.js';
import {
  conversations,
} from '../communication/communication.schema.js';
import {
  contacts,
  deals,
  leads,
  tasks,
} from '../crm/crm.schema.js';
import {
  aiAgentToolPolicies,
  aiApprovals,
  aiRuns,
  aiToolDefinitions,
  aiToolExecutions,
} from './ai.schema.js';
import { AiKnowledgeService } from './ai-knowledge.service.js';

export type AiExecutionContext = {
  principal: Principal;
  runId: string;
  agentId: string;
  agentVersionId: string;
  workspaceId: string;
  contactId?: string | null;
  conversationId?: string | null;
};

const toolSchemas = {
  get_contact: z.object({
    contactId: z.string().uuid(),
  }),
  search_knowledge: z.object({
    query: z.string().min(1).max(4000),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  create_task: z.object({
    title: z.string().min(1).max(240),
    contactId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    dealId: z.string().uuid().optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
    dueAt: z.string().optional(),
  }),
  update_lead_qualification: z.object({
    leadId: z.string().uuid(),
    temperature: z.enum(['COLD', 'WARM', 'HOT', 'LOST']).optional(),
    score: z.number().int().min(0).max(100).optional(),
    status: z.enum(['OPEN', 'QUALIFIED', 'UNQUALIFIED', 'LOST']).optional(),
  }),
  request_human_handoff: z.object({
    conversationId: z.string().uuid(),
    reason: z.string().min(1).max(2000),
  }),
  search_properties: z.object({
    city: z.string().max(120).optional(),
    locality: z.string().max(160).optional(),
    propertyType: z.string().max(48).optional(),
    configuration: z.string().max(80).optional(),
    maxPrice: z.number().min(0).optional(),
    minCarpetArea: z.number().min(0).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  recommend_properties: z.object({
    requirementId: z.string().uuid(),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  get_business_analytics: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    workspaceId: z.string().uuid().optional(),
  }),
  schedule_site_visit: z.object({
    contactId: z.string().uuid().optional(),
    requirementId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    dealId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    unitId: z.string().uuid().optional(),
    scheduledAt: z.string().min(1),
    notes: z.string().max(4000).optional(),
  }),
};

export type ToolKey = keyof typeof toolSchemas;

@Injectable()
export class AiToolGatewayService {
  constructor(
    private readonly database: DatabaseService,
    private readonly knowledge: AiKnowledgeService,
    private readonly realEstate: RealEstateService,
    private readonly analytics: AnalyticsService,
  ) {}

  async buildAgentTools(context: AiExecutionContext) {
    const policies = await this.database.db
      .select({
        toolId: aiToolDefinitions.id,
        key: aiToolDefinitions.key,
        name: aiToolDefinitions.name,
        description: aiToolDefinitions.description,
        riskLevel: aiToolDefinitions.riskLevel,
        mode: aiAgentToolPolicies.mode,
      })
      .from(aiAgentToolPolicies)
      .innerJoin(
        aiToolDefinitions,
        eq(aiToolDefinitions.id, aiAgentToolPolicies.toolDefinitionId),
      )
      .where(
        and(
          eq(aiAgentToolPolicies.organizationId, context.principal.organizationId),
          eq(aiAgentToolPolicies.agentVersionId, context.agentVersionId),
          eq(aiToolDefinitions.isActive, true),
        ),
      );

    return policies
      .filter(
        (policy): policy is typeof policy & { key: ToolKey } =>
          policy.mode !== 'DISABLED' && policy.key in toolSchemas,
      )
      .map((policy) =>
        tool({
          name: policy.key,
          description: policy.description,
          parameters: toolSchemas[policy.key],
          execute: async (args) =>
            JSON.stringify(
              await this.executeTool(
                context,
                policy.key,
                args as Record<string, unknown>,
              ),
            ),
        }),
      );
  }

  async executeTool(
    context: AiExecutionContext,
    toolKey: ToolKey,
    args: Record<string, unknown>,
  ) {
    const rows = await this.database.db
      .select({
        tool: aiToolDefinitions,
        policy: aiAgentToolPolicies,
      })
      .from(aiAgentToolPolicies)
      .innerJoin(
        aiToolDefinitions,
        eq(aiToolDefinitions.id, aiAgentToolPolicies.toolDefinitionId),
      )
      .where(
        and(
          eq(aiAgentToolPolicies.organizationId, context.principal.organizationId),
          eq(aiAgentToolPolicies.agentVersionId, context.agentVersionId),
          eq(aiToolDefinitions.key, toolKey),
          eq(aiToolDefinitions.isActive, true),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row || row.policy.mode === 'DISABLED') {
      throw new ForbiddenException('AI tool is not enabled for this agent version.');
    }

    const parsed = toolSchemas[toolKey].parse(args);
    const [execution] = await this.database.db
      .insert(aiToolExecutions)
      .values({
        organizationId: context.principal.organizationId,
        runId: context.runId,
        toolDefinitionId: row.tool.id,
        riskLevel: row.tool.riskLevel,
        policyMode: row.policy.mode,
        status: 'REQUESTED',
        arguments: parsed,
      })
      .returning();

    if (
      row.policy.mode === 'APPROVAL' ||
      row.tool.riskLevel === 'L3'
    ) {
      const [approval] = await this.database.db
        .insert(aiApprovals)
        .values({
          organizationId: context.principal.organizationId,
          toolExecutionId: execution.id,
          status: 'PENDING',
          requestedByType: 'AI_AGENT',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .returning();

      await this.database.db
        .update(aiToolExecutions)
        .set({ status: 'PENDING_APPROVAL' })
        .where(eq(aiToolExecutions.id, execution.id));

      return {
        status: 'APPROVAL_REQUIRED',
        approvalId: approval.id,
        toolExecutionId: execution.id,
        message: 'The requested action requires human approval.',
      };
    }

    return this.performExecution(
      context,
      execution.id,
      toolKey,
      parsed as Record<string, unknown>,
    );
  }
  async listApprovals(principal: Principal) {
    return this.database.db
      .select({
        approval: aiApprovals,
        execution: aiToolExecutions,
        toolKey: aiToolDefinitions.key,
        toolName: aiToolDefinitions.name,
      })
      .from(aiApprovals)
      .innerJoin(
        aiToolExecutions,
        eq(aiToolExecutions.id, aiApprovals.toolExecutionId),
      )
      .innerJoin(
        aiToolDefinitions,
        eq(aiToolDefinitions.id, aiToolExecutions.toolDefinitionId),
      )
      .where(eq(aiApprovals.organizationId, principal.organizationId));
  }

  async decideApproval(
    principal: Principal,
    approvalId: string,
    status: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    const rows = await this.database.db
      .select({
        approval: aiApprovals,
        execution: aiToolExecutions,
        run: aiRuns,
        toolKey: aiToolDefinitions.key,
      })
      .from(aiApprovals)
      .innerJoin(
        aiToolExecutions,
        eq(aiToolExecutions.id, aiApprovals.toolExecutionId),
      )
      .innerJoin(aiRuns, eq(aiRuns.id, aiToolExecutions.runId))
      .innerJoin(
        aiToolDefinitions,
        eq(aiToolDefinitions.id, aiToolExecutions.toolDefinitionId),
      )
      .where(
        and(
          eq(aiApprovals.organizationId, principal.organizationId),
          eq(aiApprovals.id, approvalId),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) throw new NotFoundException('AI approval not found.');
    if (row.approval.status !== 'PENDING') {
      throw new ConflictException('AI approval has already been decided.');
    }
    if (
      row.approval.expiresAt &&
      row.approval.expiresAt.getTime() < Date.now()
    ) {
      throw new ConflictException('AI approval has expired.');
    }

    if (status === 'REJECTED') {
      await this.database.db.transaction(async (tx) => {
        await tx
          .update(aiApprovals)
          .set({
            status,
            decidedByMemberId: principal.membershipId,
            reason: reason?.trim(),
            decidedAt: new Date(),
          })
          .where(eq(aiApprovals.id, approvalId));
        await tx
          .update(aiToolExecutions)
          .set({
            status: 'REJECTED',
            completedAt: new Date(),
            errorMessage: reason?.trim() || 'Rejected by human approver.',
          })
          .where(eq(aiToolExecutions.id, row.execution.id));
        await tx.insert(auditLogs).values({
          organizationId: principal.organizationId,
          actorType: 'USER',
          actorId: principal.userId,
          action: 'ai.approval.reject',
          resourceType: 'ai_approval',
          resourceId: approvalId,
          metadata: {
            toolExecutionId: row.execution.id,
            toolKey: row.toolKey,
            reason,
          },
        });
      });
      return { status: 'REJECTED' };
    }

    const context: AiExecutionContext = {
      principal,
      runId: row.run.id,
      agentId: row.run.agentId,
      agentVersionId: row.run.agentVersionId,
      workspaceId: row.run.workspaceId,
      contactId: row.run.contactId,
      conversationId: row.run.conversationId,
    };

    await this.database.db
      .update(aiApprovals)
      .set({
        status: 'APPROVED',
        decidedByMemberId: principal.membershipId,
        reason: reason?.trim(),
        decidedAt: new Date(),
      })
      .where(eq(aiApprovals.id, approvalId));

    return this.performExecution(
      context,
      row.execution.id,
      row.toolKey as ToolKey,
      row.execution.arguments,
    );
  }

  private async performExecution(
    context: AiExecutionContext,
    executionId: string,
    toolKey: ToolKey,
    args: Record<string, unknown>,
  ) {
    await this.database.db
      .update(aiToolExecutions)
      .set({ status: 'RUNNING', startedAt: new Date() })
      .where(eq(aiToolExecutions.id, executionId));

    try {
      const result = await this.dispatch(context, toolKey, args);
      await this.database.db
        .update(aiToolExecutions)
        .set({
          status: 'COMPLETED',
          result,
          completedAt: new Date(),
        })
        .where(eq(aiToolExecutions.id, executionId));
      return { status: 'COMPLETED', toolExecutionId: executionId, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.database.db
        .update(aiToolExecutions)
        .set({
          status: 'FAILED',
          errorMessage: message.slice(0, 4000),
          completedAt: new Date(),
        })
        .where(eq(aiToolExecutions.id, executionId));
      throw error;
    }
  }
  private async dispatch(
    context: AiExecutionContext,
    toolKey: ToolKey,
    args: Record<string, unknown>,
  ) {
    if (toolKey === 'get_contact') {
      const parsedArgs = toolSchemas.get_contact.parse(args);
      const contactId = parsedArgs.contactId;
      const rows = await this.database.db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.organizationId, context.principal.organizationId),
            eq(contacts.id, contactId),
          ),
        )
        .limit(1);
      if (!rows[0]) throw new NotFoundException('Contact not found.');
      return rows[0];
    }

    if (toolKey === 'search_knowledge') {
      const parsedArgs = toolSchemas.search_knowledge.parse(args);
      return this.knowledge.searchAcrossTenant(
        context.principal,
        parsedArgs.query,
        parsedArgs.limit ?? 5,
      );
    }

    if (toolKey === 'create_task') {
      const parsedArgs = toolSchemas.create_task.parse(args);
      const contactId =
        parsedArgs.contactId ?? context.contactId ?? undefined;
      const leadId = parsedArgs.leadId;
      const dealId = parsedArgs.dealId;

      await Promise.all([
        this.assertTenantRecord(contacts, context.principal.organizationId, contactId),
        this.assertTenantRecord(leads, context.principal.organizationId, leadId),
        this.assertTenantRecord(deals, context.principal.organizationId, dealId),
      ]);

      return this.database.db.transaction(async (tx) => {
        const [task] = await tx
          .insert(tasks)
          .values({
            organizationId: context.principal.organizationId,
            workspaceId: context.workspaceId,
            ownerMemberId: context.principal.membershipId,
            contactId,
            leadId,
            dealId,
            title: parsedArgs.title.trim(),
            priority: parsedArgs.priority ?? 'NORMAL',
            dueAt: parsedArgs.dueAt
              ? new Date(parsedArgs.dueAt)
              : undefined,
          })
          .returning();

        await tx.insert(outboxEvents).values({
          organizationId: context.principal.organizationId,
          eventType: 'crm.task.created_by_ai.v1',
          aggregateType: 'task',
          aggregateId: task.id,
          payload: {
            taskId: task.id,
            agentId: context.agentId,
            runId: context.runId,
          },
        });
        await tx.insert(auditLogs).values({
          organizationId: context.principal.organizationId,
          workspaceId: context.workspaceId,
          actorType: 'AI_AGENT',
          actorId: context.agentId,
          action: 'crm.task.create',
          resourceType: 'task',
          resourceId: task.id,
          after: task,
          metadata: { runId: context.runId },
        });
        return task;
      });
    }

    if (toolKey === 'update_lead_qualification') {
      const parsedArgs = toolSchemas.update_lead_qualification.parse(args);
      const leadId = parsedArgs.leadId;
      await this.assertTenantRecord(
        leads,
        context.principal.organizationId,
        leadId,
      );

      return this.database.db.transaction(async (tx) => {
        const [lead] = await tx
          .update(leads)
          .set({
            temperature: parsedArgs.temperature,
            score: parsedArgs.score,
            status: parsedArgs.status,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(leads.organizationId, context.principal.organizationId),
              eq(leads.id, leadId),
            ),
          )
          .returning();

        await tx.insert(outboxEvents).values({
          organizationId: context.principal.organizationId,
          eventType: 'crm.lead.qualification_updated_by_ai.v1',
          aggregateType: 'lead',
          aggregateId: lead.id,
          payload: {
            leadId: lead.id,
            agentId: context.agentId,
            runId: context.runId,
            temperature: lead.temperature,
            score: lead.score,
            status: lead.status,
          },
        });
        await tx.insert(auditLogs).values({
          organizationId: context.principal.organizationId,
          workspaceId: lead.workspaceId,
          actorType: 'AI_AGENT',
          actorId: context.agentId,
          action: 'crm.lead.qualification_update',
          resourceType: 'lead',
          resourceId: lead.id,
          after: lead,
          metadata: { runId: context.runId },
        });
        return lead;
      });
    }

    if (toolKey === 'request_human_handoff') {
      const parsedArgs = toolSchemas.request_human_handoff.parse(args);
      const conversationId = parsedArgs.conversationId;
      const rows = await this.database.db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.organizationId, context.principal.organizationId),
            eq(conversations.id, conversationId),
          ),
        )
        .limit(1);
      if (!rows[0]) throw new NotFoundException('Conversation not found.');

      return this.database.db.transaction(async (tx) => {
        const [conversation] = await tx
          .update(conversations)
          .set({
            handlingMode: 'HUMAN',
            handlingModeSource: 'AI_HANDOFF',
            handlingModeUpdatedAt: new Date(),
            status: 'OPEN',
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, conversationId))
          .returning();

        await tx.insert(outboxEvents).values({
          organizationId: context.principal.organizationId,
          eventType: 'communication.human_handoff.requested.v1',
          aggregateType: 'conversation',
          aggregateId: conversationId,
          payload: {
            conversationId,
            agentId: context.agentId,
            runId: context.runId,
            reason: parsedArgs.reason,
          },
        });
        await tx.insert(auditLogs).values({
          organizationId: context.principal.organizationId,
          workspaceId: conversation.workspaceId,
          actorType: 'AI_AGENT',
          actorId: context.agentId,
          action: 'communication.human_handoff.request',
          resourceType: 'conversation',
          resourceId: conversationId,
          metadata: { runId: context.runId, reason: parsedArgs.reason },
        });

        return {
          conversationId,
          handlingMode: conversation.handlingMode,
          reason: parsedArgs.reason,
        };
      });
    }

    if (toolKey === 'get_business_analytics') {
      const parsedArgs = toolSchemas.get_business_analytics.parse(args);
      return this.analytics.overview(context.principal, parsedArgs);
    }

    if (toolKey === 'search_properties') {
      const parsedArgs = toolSchemas.search_properties.parse(args);
      return this.realEstate.searchProperties(
        {
          ...context.principal,
          actorType: 'AI_AGENT',
          actorId: context.agentId,
        },
        parsedArgs,
      );
    }

    if (toolKey === 'recommend_properties') {
      const parsedArgs = toolSchemas.recommend_properties.parse(args);
      return this.realEstate.matchRequirement(
        {
          ...context.principal,
          actorType: 'AI_AGENT',
          actorId: context.agentId,
        },
        parsedArgs.requirementId,
        { limit: parsedArgs.limit ?? 10 },
      );
    }

    if (toolKey === 'schedule_site_visit') {
      const parsedArgs = toolSchemas.schedule_site_visit.parse(args);
      const contactId = parsedArgs.contactId ?? context.contactId ?? undefined;
      if (!contactId) {
        throw new ForbiddenException(
          'Site visit scheduling requires a tenant CRM contact context.',
        );
      }
      return this.realEstate.scheduleSiteVisit(
        {
          ...context.principal,
          actorType: 'AI_AGENT',
          actorId: context.agentId,
        },
        {
          workspaceId: context.workspaceId,
          contactId,
          requirementId: parsedArgs.requirementId,
          leadId: parsedArgs.leadId,
          dealId: parsedArgs.dealId,
          projectId: parsedArgs.projectId,
          unitId: parsedArgs.unitId,
          ownerMemberId: context.principal.membershipId,
          scheduledAt: parsedArgs.scheduledAt,
          notes: parsedArgs.notes,
        },
      );
    }

    throw new NotFoundException('AI tool handler not found.');
  }
  private async assertTenantRecord(
    table: typeof contacts | typeof leads | typeof deals,
    organizationId: string,
    id?: string,
  ) {
    if (!id) return;
    const rows = await this.database.db
      .select({ id: table.id })
      .from(table)
      .where(
        and(
          eq(table.organizationId, organizationId),
          eq(table.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException('Referenced CRM record not found.');
    }
  }
}
