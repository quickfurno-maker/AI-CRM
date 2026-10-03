import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Agent, run } from '@openai/agents';
import { and, desc, eq } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  auditLogs,
  outboxEvents,
} from '../../platform/database/schema.js';
import {
  aiAgentVersions,
  aiAgents,
  aiEvaluations,
  aiRuns,
  aiSessions,
  aiToolExecutions,
  aiUsageRecords,
} from './ai.schema.js';
import { SaasUsageMeterService } from '../saas-commercial/saas-usage-meter.service.js';
import { AiManagementService } from './ai-management.service.js';
import { AiProviderGatewayService } from './ai-provider-gateway.service.js';
import { AiProvisioningService } from './ai-provisioning.service.js';
import {
  AiToolGatewayService,
  type AiExecutionContext,
} from './ai-tool-gateway.service.js';
import type {
  CreateEvaluationDto,
  RunAgentDto,
} from './dto/ai.dto.js';

@Injectable()
export class AiRuntimeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly management: AiManagementService,
    private readonly provider: AiProviderGatewayService,
    private readonly provisioning: AiProvisioningService,
    private readonly tools: AiToolGatewayService,
    private readonly commercialUsage: SaasUsageMeterService,
  ) {}

  listRuns(principal: Principal, limit = 100) {
    return this.database.db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.organizationId, principal.organizationId))
      .orderBy(desc(aiRuns.startedAt))
      .limit(Math.min(Math.max(limit, 1), 200));
  }

  async getRun(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(aiRuns)
      .where(
        and(
          eq(aiRuns.organizationId, principal.organizationId),
          eq(aiRuns.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('AI run not found.');
    return rows[0];
  }
  async runAgent(
    principal: Principal,
    agentId: string,
    dto: RunAgentDto,
  ) {
    const agent = await this.management.getAgent(principal, agentId);
    const version = await this.management.getActiveVersion(
      principal,
      agentId,
    );
    await this.commercialUsage.assertCanConsume(
      principal.organizationId,
      'ai.agent_runs',
      1,
    );

    const conversation = await this.provisioning.assertConversation(
      principal.organizationId,
      dto.conversationId,
    );
    const contactId = await this.provisioning.assertContact(
      principal.organizationId,
      dto.contactId ?? conversation?.contactId,
    );

    const session = await this.resolveSession(
      principal,
      agent,
      dto.sessionId,
      contactId,
      dto.conversationId,
    );
    const model = this.provider.chooseModel(
      version.model,
      dto.routing ?? 'AGENT_DEFAULT',
    );

    const [runRecord] = await this.database.db
      .insert(aiRuns)
      .values({
        organizationId: principal.organizationId,
        workspaceId: agent.workspaceId,
        sessionId: session.id,
        agentId,
        agentVersionId: version.id,
        conversationId: dto.conversationId,
        contactId,
        status: 'RUNNING',
        provider: 'OPENAI',
        model,
        input: {
          text: dto.input,
          routing: dto.routing ?? 'AGENT_DEFAULT',
        },
      })
      .returning();

    const context: AiExecutionContext = {
      principal,
      runId: runRecord.id,
      agentId,
      agentVersionId: version.id,
      workspaceId: agent.workspaceId,
      contactId,
      conversationId: dto.conversationId,
    };

    const startedAt = Date.now();

    try {
      const result =
        this.provider.mode() === 'mock'
          ? await this.mockRun(dto.input, model)
          : await this.liveRun(
              agent,
              version,
              dto.input,
              context,
              model,
            );

      const latencyMs = Date.now() - startedAt;
      const estimatedCostUsd = this.provider.estimateTextCostUsd(
        model,
        result.inputTokens,
        result.outputTokens,
      );

      await this.database.db.transaction(async (tx) => {
        await tx
          .update(aiRuns)
          .set({
            status: result.hasPendingApproval
              ? 'WAITING_APPROVAL'
              : 'COMPLETED',
            output: {
              text: result.output,
              hasPendingApproval: result.hasPendingApproval,
            },
            promptTokens: result.inputTokens,
            completionTokens: result.outputTokens,
            totalTokens: result.totalTokens,
            estimatedCostUsd,
            latencyMs,
            completedAt: new Date(),
          })
          .where(eq(aiRuns.id, runRecord.id));

        await tx
          .update(aiSessions)
          .set({
            lastRunAt: new Date(),
            providerState: {
              lastRunId: runRecord.id,
              lastModel: model,
            },
            updatedAt: new Date(),
          })
          .where(eq(aiSessions.id, session.id));

        await tx.insert(aiUsageRecords).values({
          organizationId: principal.organizationId,
          workspaceId: agent.workspaceId,
          runId: runRecord.id,
          provider: 'OPENAI',
          model,
          operation: 'AGENT_RUN',
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.totalTokens,
          units: '1',
          estimatedCostUsd,
          metadata: {
            agentId,
            agentVersionId: version.id,
            costType: estimatedCostUsd ? 'ESTIMATE' : 'UNPRICED',
          },
        });

        await tx.insert(outboxEvents).values({
          organizationId: principal.organizationId,
          eventType: result.hasPendingApproval
            ? 'ai.run.waiting_approval.v1'
            : 'ai.run.completed.v1',
          aggregateType: 'ai_run',
          aggregateId: runRecord.id,
          payload: {
            runId: runRecord.id,
            agentId,
            agentVersionId: version.id,
            model,
            status: result.hasPendingApproval
              ? 'WAITING_APPROVAL'
              : 'COMPLETED',
          },
        });
      });

      try {
        await Promise.all([
          this.commercialUsage.record({
            organizationId: principal.organizationId,
            meterKey: 'ai.agent_runs',
            quantity: 1,
            sourceType: 'AI_RUN',
            sourceId: runRecord.id,
            idempotencyKey: 'ai-run:' + runRecord.id + ':run',
            metadata: { model, agentId },
            enforce: false,
          }),
          this.commercialUsage.record({
            organizationId: principal.organizationId,
            meterKey: 'openai.tokens',
            quantity: result.totalTokens,
            unit: 'token',
            sourceType: 'AI_RUN',
            sourceId: runRecord.id,
            idempotencyKey: 'ai-run:' + runRecord.id + ':tokens',
            metadata: {
              model,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              estimatedCostUsd,
            },
            enforce: false,
          }),
        ]);
      } catch (usageError) {
        await this.database.db
          .insert(outboxEvents)
          .values({
            organizationId: principal.organizationId,
            eventType: 'saas.usage.reconciliation_required.v1',
            aggregateType: 'ai_run',
            aggregateId: runRecord.id,
            payload: {
              meterKeys: ['ai.agent_runs', 'openai.tokens'],
              error:
                usageError instanceof Error
                  ? usageError.message.slice(0, 1000)
                  : String(usageError).slice(0, 1000),
            },
          })
          .catch(() => undefined);
      }

      return this.getRun(principal, runRecord.id);
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const message =
        error instanceof Error ? error.message : String(error);

      await this.database.db
        .update(aiRuns)
        .set({
          status: 'FAILED',
          failureCode:
            error instanceof Error ? error.name : 'AI_RUN_FAILED',
          failureMessage: message.slice(0, 4000),
          latencyMs,
          completedAt: new Date(),
        })
        .where(eq(aiRuns.id, runRecord.id));

      throw error;
    }
  }
  async simulateTool(
    principal: Principal,
    runId: string,
    toolKey: import('./ai-tool-gateway.service.js').ToolKey,
    args: Record<string, unknown>,
  ) {
    const runRecord = await this.getRun(principal, runId);
    return this.tools.executeTool(
      {
        principal,
        runId: runRecord.id,
        agentId: runRecord.agentId,
        agentVersionId: runRecord.agentVersionId,
        workspaceId: runRecord.workspaceId,
        contactId: runRecord.contactId,
        conversationId: runRecord.conversationId,
      },
      toolKey,
      args,
    );
  }

  async addEvaluation(
    principal: Principal,
    runId: string,
    dto: CreateEvaluationDto,
  ) {
    await this.getRun(principal, runId);
    const [evaluation] = await this.database.db
      .insert(aiEvaluations)
      .values({
        organizationId: principal.organizationId,
        runId,
        evaluator: dto.evaluator.trim(),
        score:
          dto.score === undefined ? undefined : String(dto.score),
        passed: dto.passed,
        label: dto.label?.trim(),
        details: dto.details,
      })
      .returning();

    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      actorType: 'USER',
      actorId: principal.userId,
      action: 'ai.run.evaluate',
      resourceType: 'ai_run',
      resourceId: runId,
      metadata: { evaluationId: evaluation.id },
    });
    return evaluation;
  }

  async usageSummary(principal: Principal) {
    const rows = await this.database.db
      .select()
      .from(aiUsageRecords)
      .where(eq(aiUsageRecords.organizationId, principal.organizationId))
      .orderBy(desc(aiUsageRecords.createdAt))
      .limit(5000);

    const grouped = new Map<
      string,
      {
        model: string;
        operation: string;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        estimatedCostUsd: number;
        records: number;
      }
    >();

    for (const row of rows) {
      const key = row.model + ':' + row.operation;
      const current = grouped.get(key) ?? {
        model: row.model,
        operation: row.operation,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        records: 0,
      };
      current.inputTokens += row.inputTokens;
      current.outputTokens += row.outputTokens;
      current.totalTokens += row.totalTokens;
      current.estimatedCostUsd += Number(row.estimatedCostUsd ?? 0);
      current.records += 1;
      grouped.set(key, current);
    }

    return [...grouped.values()];
  }

  private async resolveSession(
    principal: Principal,
    agent: typeof aiAgents.$inferSelect,
    requestedId?: string,
    contactId?: string,
    conversationId?: string,
  ) {
    if (requestedId) {
      const rows = await this.database.db
        .select()
        .from(aiSessions)
        .where(
          and(
            eq(aiSessions.organizationId, principal.organizationId),
            eq(aiSessions.agentId, agent.id),
            eq(aiSessions.id, requestedId),
            eq(aiSessions.status, 'ACTIVE'),
          ),
        )
        .limit(1);
      if (!rows[0]) throw new NotFoundException('AI session not found.');
      return rows[0];
    }

    const [created] = await this.database.db
      .insert(aiSessions)
      .values({
        organizationId: principal.organizationId,
        workspaceId: agent.workspaceId,
        agentId: agent.id,
        contactId,
        conversationId,
        status: 'ACTIVE',
      })
      .returning();
    return created;
  }
  private async liveRun(
    agentRecord: typeof aiAgents.$inferSelect,
    version: typeof aiAgentVersions.$inferSelect,
    input: string,
    context: AiExecutionContext,
    model: string,
  ) {
    if (this.provider.mode() !== 'live') {
      throw new Error('AI transport is disabled.');
    }

    const enabledTools = await this.tools.buildAgentTools(context);
    const agent = new Agent({
      name: agentRecord.name,
      instructions: version.instructions,
      model,
      tools: enabledTools,
    });

    const result = await run(agent, input, { maxTurns: 10 });
    const usage = result.state.usage;
    const output =
      typeof result.finalOutput === 'string'
        ? result.finalOutput
        : JSON.stringify(result.finalOutput ?? '');

    const approvalRows = await this.database.db
      .select({ id: aiToolExecutions.id })
      .from(aiToolExecutions)
      .where(
        and(
          eq(
            aiToolExecutions.organizationId,
            context.principal.organizationId,
          ),
          eq(aiToolExecutions.runId, context.runId),
          eq(aiToolExecutions.status, 'PENDING_APPROVAL'),
        ),
      );

    return {
      output,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      hasPendingApproval: approvalRows.length > 0,
    };
  }

  private async mockRun(input: string, model: string) {
    const inputTokens = Math.max(1, Math.ceil(input.length / 4));
    const output =
      'Mock agent response using ' +
      model +
      ': ' +
      input.slice(0, 500);
    const outputTokens = Math.max(1, Math.ceil(output.length / 4));
    return {
      output,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      hasPendingApproval: false,
    };
  }
}
