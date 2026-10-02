import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  auditLogs,
  organizationMembers,
  outboxEvents,
} from '../../platform/database/schema.js';
import { AutomationActionService } from './automation-action.service.js';
import {
  automationApprovals,
  automationEdges,
  automationEventReceipts,
  automationNodes,
  automationRuns,
  automationStepRuns,
  automationWorkflowVersions,
  automationWorkflows,
} from './automation.schema.js';

export type AutomationEvent = {
  id: string;
  eventType: string;
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  correlationId?: string;
  causationId?: string;
  createdAt?: string;
};

@Injectable()
export class AutomationRuntimeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly actions: AutomationActionService,
  ) {}

  listRuns(principal: Principal, limit = 100) {
    return this.database.db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.organizationId, principal.organizationId))
      .orderBy(desc(automationRuns.createdAt))
      .limit(Math.min(Math.max(limit, 1), 200));
  }

  async getRun(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(automationRuns)
      .where(
        and(
          eq(automationRuns.organizationId, principal.organizationId),
          eq(automationRuns.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Automation run not found.');
    return rows[0];
  }

  async getRunDetail(principal: Principal, id: string) {
    const run = await this.getRun(principal, id);
    const steps = await this.database.db
      .select()
      .from(automationStepRuns)
      .where(
        and(
          eq(automationStepRuns.organizationId, principal.organizationId),
          eq(automationStepRuns.runId, id),
        ),
      )
      .orderBy(asc(automationStepRuns.createdAt));
    return { run, steps };
  }

  async startManual(
    principal: Principal,
    workflowId: string,
    input: Record<string, unknown>,
    correlationId?: string,
  ) {
    const resolved = await this.activeVersion(
      principal.organizationId,
      workflowId,
    );
    if (resolved.version.triggerType !== 'MANUAL') {
      throw new ConflictException(
        'Only MANUAL workflows can be started from this endpoint.',
      );
    }

    const [run] = await this.database.db
      .insert(automationRuns)
      .values({
        organizationId: principal.organizationId,
        workspaceId: resolved.workflow.workspaceId,
        workflowId,
        workflowVersionId: resolved.version.id,
        status: 'RUNNING',
        triggerType: 'MANUAL',
        currentNodeKey: resolved.version.startNodeKey,
        context: {
          input,
          steps: {},
        },
        correlationId,
      })
      .returning();

    await this.database.db.insert(outboxEvents).values({
      organizationId: principal.organizationId,
      eventType: 'automation.run.started.v1',
      aggregateType: 'automation_run',
      aggregateId: run.id,
      payload: {
        runId: run.id,
        workflowId,
        workflowVersionId: resolved.version.id,
        triggerType: 'MANUAL',
      },
      correlationId,
    });

    await this.executeRun(run.id);
    return this.getRunDetail(principal, run.id);
  }
  async handleEvent(event: AutomationEvent) {
    const versions = await this.database.db
      .select({
        workflow: automationWorkflows,
        version: automationWorkflowVersions,
      })
      .from(automationWorkflowVersions)
      .innerJoin(
        automationWorkflows,
        eq(automationWorkflows.id, automationWorkflowVersions.workflowId),
      )
      .where(
        and(
          eq(automationWorkflowVersions.organizationId, event.organizationId),
          eq(automationWorkflowVersions.status, 'ACTIVE'),
          eq(automationWorkflowVersions.triggerType, 'EVENT'),
          eq(automationWorkflows.status, 'ACTIVE'),
        ),
      );

    const matching = versions.filter(({ version }) => {
      const eventTypes = version.triggerConfig.eventTypes;
      return (
        Array.isArray(eventTypes) &&
        eventTypes.some(
          (candidate) =>
            typeof candidate === 'string' &&
            candidate === event.eventType,
        )
      );
    });

    const results: Array<Record<string, unknown>> = [];
    for (const match of matching) {
      results.push(await this.startFromEvent(match, event));
    }
    return results;
  }

  private async startFromEvent(
    resolved: {
      workflow: typeof automationWorkflows.$inferSelect;
      version: typeof automationWorkflowVersions.$inferSelect;
    },
    event: AutomationEvent,
  ) {
    const existing = await this.database.db
      .select()
      .from(automationEventReceipts)
      .where(
        and(
          eq(
            automationEventReceipts.workflowVersionId,
            resolved.version.id,
          ),
          eq(automationEventReceipts.eventId, event.id),
        ),
      )
      .limit(1);
    if (existing[0]) {
      return {
        status: 'DUPLICATE',
        workflowVersionId: resolved.version.id,
        runId: existing[0].runId,
      };
    }

    const result = await this.database.db.transaction(async (tx) => {
      const insertedReceipt = await tx
        .insert(automationEventReceipts)
        .values({
          organizationId: event.organizationId,
          workflowVersionId: resolved.version.id,
          eventId: event.id,
          eventType: event.eventType,
        })
        .onConflictDoNothing()
        .returning();

      if (!insertedReceipt[0]) {
        return { duplicate: true as const, run: undefined };
      }

      const [run] = await tx
        .insert(automationRuns)
        .values({
          organizationId: event.organizationId,
          workspaceId: resolved.workflow.workspaceId,
          workflowId: resolved.workflow.id,
          workflowVersionId: resolved.version.id,
          status: 'RUNNING',
          triggerType: 'EVENT',
          triggerEventId: event.id,
          triggerEventType: event.eventType,
          currentNodeKey: resolved.version.startNodeKey,
          context: {
            event: {
              id: event.id,
              eventType: event.eventType,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              payload: event.payload,
              createdAt: event.createdAt,
            },
            steps: {},
          },
          correlationId: event.correlationId,
          causationId: event.causationId,
        })
        .returning();

      await tx
        .update(automationEventReceipts)
        .set({ runId: run.id })
        .where(eq(automationEventReceipts.id, insertedReceipt[0].id));

      await tx.insert(outboxEvents).values({
        organizationId: event.organizationId,
        eventType: 'automation.run.started.v1',
        aggregateType: 'automation_run',
        aggregateId: run.id,
        payload: {
          runId: run.id,
          workflowId: resolved.workflow.id,
          workflowVersionId: resolved.version.id,
          triggerType: 'EVENT',
          triggerEventId: event.id,
          triggerEventType: event.eventType,
        },
        correlationId: event.correlationId,
        causationId: event.id,
      });

      return { duplicate: false as const, run };
    });

    if (result.duplicate || !result.run) {
      const receipt = await this.database.db
        .select()
        .from(automationEventReceipts)
        .where(
          and(
            eq(
              automationEventReceipts.workflowVersionId,
              resolved.version.id,
            ),
            eq(automationEventReceipts.eventId, event.id),
          ),
        )
        .limit(1);
      return {
        status: 'DUPLICATE',
        workflowVersionId: resolved.version.id,
        runId: receipt[0]?.runId,
      };
    }

    await this.executeRun(result.run.id);
    return {
      status: 'STARTED',
      workflowVersionId: resolved.version.id,
      runId: result.run.id,
    };
  }
  async executeRun(runId: string) {
    const runRows = await this.database.db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.id, runId))
      .limit(1);
    let runRecord = runRows[0];
    if (!runRecord) throw new NotFoundException('Automation run not found.');
    if (!['RUNNING'].includes(runRecord.status)) return runRecord;

    const [versionRows, graphNodes, graphEdges] = await Promise.all([
      this.database.db
        .select()
        .from(automationWorkflowVersions)
        .where(eq(automationWorkflowVersions.id, runRecord.workflowVersionId))
        .limit(1),
      this.database.db
        .select()
        .from(automationNodes)
        .where(eq(automationNodes.workflowVersionId, runRecord.workflowVersionId)),
      this.database.db
        .select()
        .from(automationEdges)
        .where(eq(automationEdges.workflowVersionId, runRecord.workflowVersionId))
        .orderBy(automationEdges.priority, automationEdges.createdAt),
    ]);
    const version = versionRows[0];
    if (!version) {
      return this.failRun(runId, 'Workflow version no longer exists.');
    }

    const nodes = new Map(graphNodes.map((node) => [node.nodeKey, node]));
    const principal = await this.resolveAutomationPrincipal(
      runRecord.organizationId,
      version.createdByMemberId ?? undefined,
      runId,
    );

    while (runRecord.status === 'RUNNING') {
      if (runRecord.stepsExecuted >= version.maxSteps) {
        return this.actionRequired(
          runId,
          'Automation exceeded its maximum step count.',
        );
      }

      const nodeKey = runRecord.currentNodeKey;
      if (!nodeKey) {
        return this.failRun(runId, 'Automation run has no current node.');
      }
      const node = nodes.get(nodeKey);
      if (!node) {
        return this.failRun(
          runId,
          'Automation node ' + nodeKey + ' was not found.',
        );
      }

      const already = await this.database.db
        .select()
        .from(automationStepRuns)
        .where(
          and(
            eq(automationStepRuns.runId, runId),
            eq(automationStepRuns.nodeKey, nodeKey),
          ),
        )
        .orderBy(desc(automationStepRuns.createdAt))
        .limit(1);

      if (already[0]?.status === 'COMPLETED') {
        const branch =
          typeof already[0].output?.branch === 'string'
            ? already[0].output.branch
            : 'DEFAULT';
        const next = this.nextNode(graphEdges, nodeKey, branch);
        if (!next) {
          return this.failRun(
            runId,
            'Completed node has no valid next edge.',
          );
        }
        runRecord = await this.advanceRun(
          runRecord,
          next,
          nodeKey,
          already[0].output ?? {},
        );
        continue;
      }
      if (already[0]?.status === 'RUNNING') {
        return this.actionRequired(
          runId,
          'Automation step is already processing and requires reconciliation.',
        );
      }

      const attempt = (already[0]?.attempt ?? 0) + 1;
      const [step] = await this.database.db
        .insert(automationStepRuns)
        .values({
          organizationId: runRecord.organizationId,
          runId,
          nodeId: node.id,
          nodeKey: node.nodeKey,
          nodeType: node.nodeType,
          attempt,
          status: 'RUNNING',
          input: {
            config: node.config,
            context: runRecord.context,
          },
        })
        .returning();

      try {
        const outcome = await this.executeNode(
          principal,
          runRecord,
          node,
          graphEdges,
          step.id,
        );

        if (outcome.terminal) {
          return outcome.run;
        }

        const refreshed = await this.database.db
          .select()
          .from(automationRuns)
          .where(eq(automationRuns.id, runId))
          .limit(1);
        runRecord = refreshed[0];
        if (!runRecord) {
          throw new Error('Automation run disappeared during execution.');
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        const retry = this.retryPolicy(node.config);
        const action =
          node.nodeType === 'ACTION' &&
          typeof node.config.action === 'string'
            ? node.config.action
            : undefined;

        if (
          retry &&
          step.attempt < retry.maxAttempts &&
          (!action || this.isRetrySafeAction(action))
        ) {
          const delaySeconds = Math.min(
            retry.backoffSeconds *
              Math.pow(retry.multiplier, Math.max(step.attempt - 1, 0)),
            retry.maxBackoffSeconds,
          );
          const wakeAt = new Date(Date.now() + delaySeconds * 1000);

          await this.database.db.transaction(async (tx) => {
            await tx
              .update(automationStepRuns)
              .set({
                status: 'RETRY_WAIT',
                errorMessage: message.slice(0, 4000),
                wakeAt,
                completedAt: new Date(),
              })
              .where(eq(automationStepRuns.id, step.id));

            await tx
              .update(automationRuns)
              .set({
                status: 'WAITING',
                wakeAt,
                lastError: message.slice(0, 4000),
                updatedAt: new Date(),
              })
              .where(eq(automationRuns.id, runId));

            await tx.insert(outboxEvents).values({
              organizationId: runRecord.organizationId,
              eventType: 'automation.step.retry_scheduled.v1',
              aggregateType: 'automation_run',
              aggregateId: runId,
              payload: {
                runId,
                nodeKey: node.nodeKey,
                attempt: step.attempt,
                nextAttempt: step.attempt + 1,
                wakeAt: wakeAt.toISOString(),
                error: message.slice(0, 1000),
              },
              correlationId: runRecord.correlationId,
              causationId: runRecord.triggerEventId ?? undefined,
            });
          });

          const refreshed = await this.database.db
            .select()
            .from(automationRuns)
            .where(eq(automationRuns.id, runId))
            .limit(1);
          return refreshed[0];
        }

        await this.database.db
          .update(automationStepRuns)
          .set({
            status: 'FAILED',
            errorMessage: message.slice(0, 4000),
            completedAt: new Date(),
          })
          .where(eq(automationStepRuns.id, step.id));

        if (action && this.isAmbiguousExternalAction(action)) {
          return this.actionRequired(
            runId,
            'External action failed or returned an ambiguous result: ' +
              message,
          );
        }

        return this.failRun(runId, message);
      }
    }

    return runRecord;
  }
  private async executeNode(
    principal: Principal,
    runRecord: typeof automationRuns.$inferSelect,
    node: typeof automationNodes.$inferSelect,
    edges: Array<typeof automationEdges.$inferSelect>,
    stepId: string,
  ): Promise<{
    terminal: boolean;
    run: typeof automationRuns.$inferSelect;
  }> {
    if (node.nodeType === 'END') {
      await this.completeStep(stepId, { branch: 'END' });
      const run = await this.completeRun(runRecord.id);
      return { terminal: true, run };
    }

    if (node.nodeType === 'CONDITION') {
      const matched = this.evaluateCondition(node.config, runRecord.context);
      const branch = matched ? 'TRUE' : 'FALSE';
      const next = this.nextNode(edges, node.nodeKey, branch);
      if (!next) {
        throw new BadRequestException(
          'CONDITION node has no edge for branch ' + branch + '.',
        );
      }
      await this.completeStep(stepId, { matched, branch });
      const run = await this.advanceRun(runRecord, next, node.nodeKey, {
        matched,
        branch,
      });
      return { terminal: false, run };
    }

    if (node.nodeType === 'WAIT') {
      const seconds = Number(node.config.durationSeconds);
      const next = this.nextNode(edges, node.nodeKey, 'DEFAULT');
      if (!next) throw new BadRequestException('WAIT node has no next edge.');
      const wakeAt = new Date(Date.now() + seconds * 1000);

      await this.database.db.transaction(async (tx) => {
        await tx
          .update(automationStepRuns)
          .set({
            status: 'COMPLETED',
            output: {
              branch: 'DEFAULT',
              durationSeconds: seconds,
              wakeAt: wakeAt.toISOString(),
            },
            wakeAt,
            completedAt: new Date(),
          })
          .where(eq(automationStepRuns.id, stepId));

        await tx
          .update(automationRuns)
          .set({
            status: 'WAITING',
            currentNodeKey: next,
            wakeAt,
            stepsExecuted: runRecord.stepsExecuted + 1,
            updatedAt: new Date(),
          })
          .where(eq(automationRuns.id, runRecord.id));

        await tx.insert(outboxEvents).values({
          organizationId: runRecord.organizationId,
          eventType: 'automation.run.waiting.v1',
          aggregateType: 'automation_run',
          aggregateId: runRecord.id,
          payload: {
            runId: runRecord.id,
            nodeKey: node.nodeKey,
            wakeAt: wakeAt.toISOString(),
          },
          correlationId: runRecord.correlationId,
          causationId: runRecord.triggerEventId ?? undefined,
        });
      });

      const [run] = await this.database.db
        .select()
        .from(automationRuns)
        .where(eq(automationRuns.id, runRecord.id))
        .limit(1);
      return { terminal: true, run };
    }

    if (node.nodeType === 'APPROVAL') {
      const expirySeconds =
        node.config.expirySeconds === undefined
          ? 86_400
          : Number(node.config.expirySeconds);
      const title = String(node.config.title);
      const description =
        typeof node.config.description === 'string'
          ? node.config.description
          : undefined;

      await this.database.db.transaction(async (tx) => {
        await tx
          .update(automationStepRuns)
          .set({ status: 'WAITING_APPROVAL' })
          .where(eq(automationStepRuns.id, stepId));

        const [approval] = await tx
          .insert(automationApprovals)
          .values({
            organizationId: runRecord.organizationId,
            runId: runRecord.id,
            stepRunId: stepId,
            status: 'PENDING',
            title,
            description,
            requestedByType: 'AUTOMATION',
            expiresAt: new Date(Date.now() + expirySeconds * 1000),
          })
          .returning();

        await tx
          .update(automationRuns)
          .set({
            status: 'WAITING_APPROVAL',
            stepsExecuted: runRecord.stepsExecuted + 1,
            updatedAt: new Date(),
          })
          .where(eq(automationRuns.id, runRecord.id));

        await tx.insert(outboxEvents).values({
          organizationId: runRecord.organizationId,
          eventType: 'automation.approval.requested.v1',
          aggregateType: 'automation_approval',
          aggregateId: approval.id,
          payload: {
            approvalId: approval.id,
            runId: runRecord.id,
            nodeKey: node.nodeKey,
            title,
          },
          correlationId: runRecord.correlationId,
          causationId: runRecord.triggerEventId ?? undefined,
        });
      });

      const [run] = await this.database.db
        .select()
        .from(automationRuns)
        .where(eq(automationRuns.id, runRecord.id))
        .limit(1);
      return { terminal: true, run };
    }

    if (node.nodeType === 'ACTION') {
      const action = String(node.config.action);
      const rawInput =
        node.config.input &&
        typeof node.config.input === 'object' &&
        !Array.isArray(node.config.input)
          ? (node.config.input as Record<string, unknown>)
          : {};

      const executionContext = {
        ...runRecord.context,
        automation: {
          runId: runRecord.id,
          workflowId: runRecord.workflowId,
          workflowVersionId: runRecord.workflowVersionId,
          nodeKey: node.nodeKey,
        },
      };

      const result = await this.actions.execute(
        principal,
        action,
        rawInput,
        executionContext,
      );
      const next = this.nextNode(edges, node.nodeKey, 'DEFAULT');
      if (!next) throw new BadRequestException('ACTION node has no next edge.');

      await this.completeStep(stepId, {
        branch: 'DEFAULT',
        action,
        result: this.jsonValue(result),
      });
      const run = await this.advanceRun(
        runRecord,
        next,
        node.nodeKey,
        this.jsonValue(result),
      );
      return { terminal: false, run };
    }

    throw new BadRequestException(
      'Unsupported automation node type ' + node.nodeType + '.',
    );
  }
  async decideApproval(
    principal: Principal,
    approvalId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    const rows = await this.database.db
      .select({
        approval: automationApprovals,
        run: automationRuns,
        step: automationStepRuns,
      })
      .from(automationApprovals)
      .innerJoin(
        automationRuns,
        eq(automationRuns.id, automationApprovals.runId),
      )
      .innerJoin(
        automationStepRuns,
        eq(automationStepRuns.id, automationApprovals.stepRunId),
      )
      .where(
        and(
          eq(
            automationApprovals.organizationId,
            principal.organizationId,
          ),
          eq(automationApprovals.id, approvalId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Automation approval not found.');
    }
    if (row.approval.status !== 'PENDING') {
      throw new ConflictException('Automation approval is already decided.');
    }
    if (
      row.approval.expiresAt &&
      row.approval.expiresAt.getTime() < Date.now()
    ) {
      throw new ConflictException('Automation approval has expired.');
    }

    const edges = await this.database.db
      .select()
      .from(automationEdges)
      .where(
        and(
          eq(
            automationEdges.organizationId,
            principal.organizationId,
          ),
          eq(
            automationEdges.workflowVersionId,
            row.run.workflowVersionId,
          ),
          eq(automationEdges.sourceNodeKey, row.step.nodeKey),
        ),
      )
      .orderBy(automationEdges.priority);

    const next = this.nextNode(edges, row.step.nodeKey, decision);
    if (!next) {
      throw new ConflictException(
        'Approval node does not have a ' + decision + ' edge.',
      );
    }

    await this.database.db.transaction(async (tx) => {
      await tx
        .update(automationApprovals)
        .set({
          status: decision,
          decidedByMemberId: principal.membershipId,
          reason: reason?.trim(),
          decidedAt: new Date(),
        })
        .where(eq(automationApprovals.id, approvalId));

      await tx
        .update(automationStepRuns)
        .set({
          status: 'COMPLETED',
          output: { decision, reason, branch: decision },
          completedAt: new Date(),
        })
        .where(eq(automationStepRuns.id, row.step.id));

      await tx
        .update(automationRuns)
        .set({
          status: 'RUNNING',
          currentNodeKey: next,
          updatedAt: new Date(),
        })
        .where(eq(automationRuns.id, row.run.id));

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: row.run.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action:
          decision === 'APPROVED'
            ? 'automation.approval.approve'
            : 'automation.approval.reject',
        resourceType: 'automation_approval',
        resourceId: approvalId,
        metadata: {
          runId: row.run.id,
          nodeKey: row.step.nodeKey,
          reason,
        },
      });
    });

    await this.executeRun(row.run.id);
    return this.getRunDetail(principal, row.run.id);
  }

  async pauseRun(
    principal: Principal,
    runId: string,
    reason?: string,
  ) {
    const run = await this.getRun(principal, runId);
    if (!['RUNNING', 'WAITING'].includes(run.status)) {
      throw new ConflictException(
        'Only RUNNING or WAITING automation runs can be paused.',
      );
    }

    const context = {
      ...run.context,
      control: {
        previousStatus: run.status,
        pausedAt: new Date().toISOString(),
        reason: reason?.trim(),
      },
    };

    const [updated] = await this.database.db
      .update(automationRuns)
      .set({
        status: 'PAUSED',
        context,
        lastError: reason?.trim() || run.lastError,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(automationRuns.organizationId, principal.organizationId),
          eq(automationRuns.id, runId),
        ),
      )
      .returning();

    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      workspaceId: run.workspaceId,
      actorType: 'USER',
      actorId: principal.userId,
      action: 'automation.run.pause',
      resourceType: 'automation_run',
      resourceId: runId,
      metadata: { reason },
    });

    await this.database.db.insert(outboxEvents).values({
      organizationId: principal.organizationId,
      eventType: 'automation.run.paused.v1',
      aggregateType: 'automation_run',
      aggregateId: runId,
      payload: { runId, reason },
      correlationId: run.correlationId,
      causationId: run.triggerEventId ?? undefined,
    });

    return updated;
  }

  async resumePausedRun(principal: Principal, runId: string) {
    const run = await this.getRun(principal, runId);
    if (run.status !== 'PAUSED') {
      throw new ConflictException('Only PAUSED automation runs can be resumed.');
    }

    const control =
      run.context.control &&
      typeof run.context.control === 'object' &&
      !Array.isArray(run.context.control)
        ? (run.context.control as Record<string, unknown>)
        : {};
    const previousStatus =
      typeof control.previousStatus === 'string'
        ? control.previousStatus
        : 'RUNNING';
    const shouldWait =
      previousStatus === 'WAITING' &&
      run.wakeAt &&
      run.wakeAt.getTime() > Date.now();

    const [updated] = await this.database.db
      .update(automationRuns)
      .set({
        status: shouldWait ? 'WAITING' : 'RUNNING',
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(automationRuns.organizationId, principal.organizationId),
          eq(automationRuns.id, runId),
        ),
      )
      .returning();

    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      workspaceId: run.workspaceId,
      actorType: 'USER',
      actorId: principal.userId,
      action: 'automation.run.resume',
      resourceType: 'automation_run',
      resourceId: runId,
    });

    if (!shouldWait) {
      await this.executeRun(runId);
      return this.getRunDetail(principal, runId);
    }

    return { run: updated, steps: [] };
  }

  async cancelRun(
    principal: Principal,
    runId: string,
    reason?: string,
  ) {
    const run = await this.getRun(principal, runId);
    if (
      ['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)
    ) {
      throw new ConflictException('Automation run is already terminal.');
    }

    const now = new Date();
    await this.database.db.transaction(async (tx) => {
      await tx
        .update(automationRuns)
        .set({
          status: 'CANCELLED',
          currentNodeKey: null,
          wakeAt: null,
          lastError: reason?.trim() || 'Cancelled by operator.',
          completedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(automationRuns.organizationId, principal.organizationId),
            eq(automationRuns.id, runId),
          ),
        );

      await tx
        .update(automationStepRuns)
        .set({
          status: 'CANCELLED',
          errorMessage: reason?.trim() || 'Cancelled by operator.',
          completedAt: now,
        })
        .where(
          and(
            eq(automationStepRuns.organizationId, principal.organizationId),
            eq(automationStepRuns.runId, runId),
            inArray(automationStepRuns.status, [
              'RUNNING',
              'WAITING_APPROVAL',
              'RETRY_WAIT',
            ]),
          ),
        );

      await tx
        .update(automationApprovals)
        .set({
          status: 'CANCELLED',
          reason: reason?.trim() || 'Run cancelled by operator.',
          decidedAt: now,
        })
        .where(
          and(
            eq(automationApprovals.organizationId, principal.organizationId),
            eq(automationApprovals.runId, runId),
            eq(automationApprovals.status, 'PENDING'),
          ),
        );

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: run.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'automation.run.cancel',
        resourceType: 'automation_run',
        resourceId: runId,
        metadata: { reason },
      });

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'automation.run.cancelled.v1',
        aggregateType: 'automation_run',
        aggregateId: runId,
        payload: { runId, reason },
        correlationId: run.correlationId,
        causationId: run.triggerEventId ?? undefined,
      });
    });

    return this.getRunDetail(principal, runId);
  }

  async reconcileRun(
    principal: Principal,
    runId: string,
    action: 'RETRY' | 'CANCEL',
    reason: string,
    confirmedNoSideEffect = false,
  ) {
    const run = await this.getRun(principal, runId);
    if (run.status !== 'ACTION_REQUIRED') {
      throw new ConflictException(
        'Only ACTION_REQUIRED automation runs can be reconciled.',
      );
    }

    if (action === 'CANCEL') {
      return this.cancelRun(principal, runId, reason);
    }

    if (!confirmedNoSideEffect) {
      throw new ConflictException(
        'Retry requires confirmation that the previous attempt caused no external side effect.',
      );
    }

    const latest = await this.database.db
      .select()
      .from(automationStepRuns)
      .where(
        and(
          eq(automationStepRuns.organizationId, principal.organizationId),
          eq(automationStepRuns.runId, runId),
        ),
      )
      .orderBy(desc(automationStepRuns.createdAt))
      .limit(1);

    if (latest[0]?.status === 'RUNNING') {
      await this.database.db
        .update(automationStepRuns)
        .set({
          status: 'RECONCILED_RETRY',
          errorMessage: reason.trim(),
          completedAt: new Date(),
        })
        .where(eq(automationStepRuns.id, latest[0].id));
    }

    await this.database.db
      .update(automationRuns)
      .set({
        status: 'RUNNING',
        lastError: null,
        wakeAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(automationRuns.organizationId, principal.organizationId),
          eq(automationRuns.id, runId),
        ),
      );

    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      workspaceId: run.workspaceId,
      actorType: 'USER',
      actorId: principal.userId,
      action: 'automation.run.reconcile_retry',
      resourceType: 'automation_run',
      resourceId: runId,
      metadata: { reason, confirmedNoSideEffect },
    });

    await this.executeRun(runId);
    return this.getRunDetail(principal, runId);
  }

  listApprovals(principal: Principal) {
    return this.database.db
      .select()
      .from(automationApprovals)
      .where(
        eq(
          automationApprovals.organizationId,
          principal.organizationId,
        ),
      )
      .orderBy(desc(automationApprovals.requestedAt));
  }

  async resumeWaitingRun(runId: string) {
    const rows = await this.database.db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.id, runId))
      .limit(1);
    const run = rows[0];
    if (!run) return undefined;
    if (run.status !== 'RUNNING') return run;
    return this.executeRun(runId);
  }

  async resumeDueRun(principal: Principal, runId: string) {
    const run = await this.getRun(principal, runId);
    if (run.status !== 'WAITING') {
      throw new ConflictException('Only WAITING automation runs can be resumed.');
    }
    if (!run.wakeAt || run.wakeAt.getTime() > Date.now()) {
      throw new ConflictException('Automation wait has not reached its wake time.');
    }

    await this.database.db
      .update(automationRuns)
      .set({
        status: 'RUNNING',
        wakeAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(automationRuns.organizationId, principal.organizationId),
          eq(automationRuns.id, runId),
          eq(automationRuns.status, 'WAITING'),
        ),
      );

    await this.executeRun(runId);
    return this.getRunDetail(principal, runId);
  }
  private async activeVersion(
    organizationId: string,
    workflowId: string,
  ) {
    const rows = await this.database.db
      .select({
        workflow: automationWorkflows,
        version: automationWorkflowVersions,
      })
      .from(automationWorkflowVersions)
      .innerJoin(
        automationWorkflows,
        eq(automationWorkflows.id, automationWorkflowVersions.workflowId),
      )
      .where(
        and(
          eq(automationWorkflows.organizationId, organizationId),
          eq(automationWorkflows.id, workflowId),
          eq(automationWorkflows.status, 'ACTIVE'),
          eq(automationWorkflowVersions.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException('Active automation workflow not found.');
    }
    if (!rows[0].version.startNodeKey) {
      throw new ConflictException('Active workflow has no start node.');
    }
    return rows[0];
  }

  private nextNode(
    edges: Array<typeof automationEdges.$inferSelect>,
    sourceNodeKey: string,
    branchKey: string,
  ) {
    return edges.find(
      (edge) =>
        edge.sourceNodeKey === sourceNodeKey &&
        edge.branchKey === branchKey,
    )?.targetNodeKey;
  }

  private async completeStep(
    stepId: string,
    output: Record<string, unknown>,
  ) {
    await this.database.db
      .update(automationStepRuns)
      .set({
        status: 'COMPLETED',
        output,
        completedAt: new Date(),
      })
      .where(eq(automationStepRuns.id, stepId));
  }

  private async advanceRun(
    runRecord: typeof automationRuns.$inferSelect,
    nextNodeKey: string,
    completedNodeKey: string,
    output: unknown,
  ) {
    const context = this.appendStepOutput(
      runRecord.context,
      completedNodeKey,
      output,
    );
    const [run] = await this.database.db
      .update(automationRuns)
      .set({
        currentNodeKey: nextNodeKey,
        context,
        stepsExecuted: runRecord.stepsExecuted + 1,
        updatedAt: new Date(),
      })
      .where(eq(automationRuns.id, runRecord.id))
      .returning();
    return run;
  }

  private async moveRun(
    runRecord: typeof automationRuns.$inferSelect,
    nextNodeKey: string,
  ) {
    const [run] = await this.database.db
      .update(automationRuns)
      .set({
        currentNodeKey: nextNodeKey,
        updatedAt: new Date(),
      })
      .where(eq(automationRuns.id, runRecord.id))
      .returning();
    return run;
  }

  private async completeRun(runId: string) {
    const [run] = await this.database.db
      .update(automationRuns)
      .set({
        status: 'COMPLETED',
        currentNodeKey: null,
        wakeAt: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(automationRuns.id, runId))
      .returning();

    await this.database.db.insert(outboxEvents).values({
      organizationId: run.organizationId,
      eventType: 'automation.run.completed.v1',
      aggregateType: 'automation_run',
      aggregateId: run.id,
      payload: {
        runId: run.id,
        workflowId: run.workflowId,
        workflowVersionId: run.workflowVersionId,
        stepsExecuted: run.stepsExecuted,
      },
      correlationId: run.correlationId,
      causationId: run.triggerEventId ?? undefined,
    });
    return run;
  }

  private async failRun(runId: string, error: string) {
    const [run] = await this.database.db
      .update(automationRuns)
      .set({
        status: 'FAILED',
        lastError: error.slice(0, 4000),
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(automationRuns.id, runId))
      .returning();
    return run;
  }

  private async actionRequired(runId: string, reason: string) {
    const [run] = await this.database.db
      .update(automationRuns)
      .set({
        status: 'ACTION_REQUIRED',
        lastError: reason.slice(0, 4000),
        updatedAt: new Date(),
      })
      .where(eq(automationRuns.id, runId))
      .returning();
    return run;
  }
  private retryPolicy(config: Record<string, unknown>) {
    const raw = config.retry;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return undefined;
    }

    const retry = raw as Record<string, unknown>;
    const maxAttempts = Number(retry.maxAttempts ?? 1);
    const backoffSeconds = Number(retry.backoffSeconds ?? 5);
    const multiplier = Number(retry.multiplier ?? 2);
    const maxBackoffSeconds = Number(retry.maxBackoffSeconds ?? 300);

    if (
      !Number.isInteger(maxAttempts) ||
      maxAttempts < 2 ||
      maxAttempts > 10 ||
      !Number.isFinite(backoffSeconds) ||
      backoffSeconds < 1 ||
      backoffSeconds > 3600 ||
      !Number.isFinite(multiplier) ||
      multiplier < 1 ||
      multiplier > 10 ||
      !Number.isFinite(maxBackoffSeconds) ||
      maxBackoffSeconds < backoffSeconds ||
      maxBackoffSeconds > 86400
    ) {
      return undefined;
    }

    return {
      maxAttempts,
      backoffSeconds,
      multiplier,
      maxBackoffSeconds,
    };
  }

  private isRetrySafeAction(action: string) {
    return new Set([
      'CRM_UPDATE_LEAD',
      'WHATSAPP_SEND_TEXT',
      'WHATSAPP_SEND_TEMPLATE',
      'SET_CONVERSATION_MODE',
    ]).has(action);
  }

  private isAmbiguousExternalAction(action: string) {
    return new Set([
      'WHATSAPP_SEND_TEXT',
      'WHATSAPP_SEND_TEMPLATE',
      'AI_RUN_AGENT',
    ]).has(action);
  }

  private evaluateCondition(
    config: Record<string, unknown>,
    context: Record<string, unknown>,
  ) {
    const path = String(config.path);
    const operator = String(config.operator);
    const actual = this.actions.readPath(context, path);
    const expected = config.value;

    if (operator === 'EXISTS') {
      return actual !== undefined && actual !== null;
    }
    if (operator === 'EQUALS') return this.sameValue(actual, expected);
    if (operator === 'NOT_EQUALS') return !this.sameValue(actual, expected);
    if (operator === 'IN') {
      return Array.isArray(expected)
        ? expected.some((value) => this.sameValue(actual, value))
        : false;
    }

    const left = Number(actual);
    const right = Number(expected);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (operator === 'GT') return left > right;
    if (operator === 'GTE') return left >= right;
    if (operator === 'LT') return left < right;
    if (operator === 'LTE') return left <= right;
    return false;
  }

  private sameValue(left: unknown, right: unknown) {
    if (
      (typeof left === 'string' || typeof left === 'number' || typeof left === 'boolean') &&
      (typeof right === 'string' || typeof right === 'number' || typeof right === 'boolean')
    ) {
      return String(left) === String(right);
    }
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private appendStepOutput(
    context: Record<string, unknown>,
    nodeKey: string,
    output: unknown,
  ) {
    const existingSteps =
      context.steps &&
      typeof context.steps === 'object' &&
      !Array.isArray(context.steps)
        ? (context.steps as Record<string, unknown>)
        : {};
    return {
      ...context,
      steps: {
        ...existingSteps,
        [nodeKey]: this.jsonValue(output),
      },
    };
  }

  private jsonValue(value: unknown): Record<string, unknown> {
    const normalized = JSON.parse(
      JSON.stringify(value ?? {}),
    ) as unknown;
    if (
      normalized &&
      typeof normalized === 'object' &&
      !Array.isArray(normalized)
    ) {
      return normalized as Record<string, unknown>;
    }
    return { value: normalized };
  }

  private async resolveAutomationPrincipal(
    organizationId: string,
    preferredMembershipId: string | undefined,
    runId: string,
  ): Promise<Principal> {
    let member:
      | typeof organizationMembers.$inferSelect
      | undefined;

    if (preferredMembershipId) {
      const rows = await this.database.db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, organizationId),
            eq(organizationMembers.id, preferredMembershipId),
            eq(organizationMembers.status, 'ACTIVE'),
          ),
        )
        .limit(1);
      member = rows[0];
    }

    if (!member) {
      const rows = await this.database.db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, organizationId),
            eq(organizationMembers.status, 'ACTIVE'),
            eq(organizationMembers.isOwner, true),
          ),
        )
        .limit(1);
      member = rows[0];
    }

    if (!member) {
      throw new ConflictException(
        'Automation requires an active owner/operator membership.',
      );
    }

    return {
      userId: member.userId,
      organizationId,
      membershipId: member.id,
      sessionId: randomUUID(),
      isPlatformAdmin: false,
      actorType: 'AUTOMATION',
      actorId: runId,
    };
  }
}
