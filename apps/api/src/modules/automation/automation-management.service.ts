import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, max } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  auditLogs,
  outboxEvents,
  workspaces,
} from '../../platform/database/schema.js';
import {
  automationEdges,
  automationNodes,
  automationWorkflowVersions,
  automationWorkflows,
} from './automation.schema.js';
import type {
  CreateWorkflowDto,
  CreateWorkflowVersionDto,
  SaveWorkflowGraphDto,
} from './dto/automation.dto.js';

const ACTIONS = new Set([
  'CRM_CREATE_TASK',
  'CRM_UPDATE_LEAD',
  'WHATSAPP_SEND_TEXT',
  'WHATSAPP_SEND_TEMPLATE',
  'AI_RUN_AGENT',
  'SET_CONVERSATION_MODE',
]);

@Injectable()
export class AutomationManagementService {
  constructor(private readonly database: DatabaseService) {}

  private async resolveWorkspace(
    organizationId: string,
    requestedId?: string,
  ) {
    const rows = requestedId
      ? await this.database.db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(
            and(
              eq(workspaces.organizationId, organizationId),
              eq(workspaces.id, requestedId),
            ),
          )
          .limit(1)
      : await this.database.db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.organizationId, organizationId))
          .orderBy(asc(workspaces.createdAt))
          .limit(1);
    if (!rows[0]) throw new NotFoundException('Workspace not found.');
    return rows[0].id;
  }

  listWorkflows(principal: Principal) {
    return this.database.db
      .select()
      .from(automationWorkflows)
      .where(
        eq(automationWorkflows.organizationId, principal.organizationId),
      )
      .orderBy(desc(automationWorkflows.updatedAt));
  }

  async getWorkflow(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(automationWorkflows)
      .where(
        and(
          eq(
            automationWorkflows.organizationId,
            principal.organizationId,
          ),
          eq(automationWorkflows.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Automation workflow not found.');
    return rows[0];
  }

  async getVersion(
    principal: Principal,
    workflowId: string,
    versionId: string,
  ) {
    const rows = await this.database.db
      .select()
      .from(automationWorkflowVersions)
      .where(
        and(
          eq(
            automationWorkflowVersions.organizationId,
            principal.organizationId,
          ),
          eq(automationWorkflowVersions.workflowId, workflowId),
          eq(automationWorkflowVersions.id, versionId),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException('Automation workflow version not found.');
    }
    return rows[0];
  }

  listVersions(principal: Principal, workflowId: string) {
    return this.database.db
      .select()
      .from(automationWorkflowVersions)
      .where(
        and(
          eq(
            automationWorkflowVersions.organizationId,
            principal.organizationId,
          ),
          eq(automationWorkflowVersions.workflowId, workflowId),
        ),
      )
      .orderBy(desc(automationWorkflowVersions.version));
  }
  async createWorkflow(principal: Principal, dto: CreateWorkflowDto) {
    const workspaceId = await this.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    const triggerType = dto.triggerType ?? 'EVENT';
    const triggerConfig = dto.triggerConfig ?? {
      eventTypes: ['crm.lead.created.v1'],
    };
    this.validateTrigger(triggerType, triggerConfig);

    return this.database.db.transaction(async (tx) => {
      const [workflow] = await tx
        .insert(automationWorkflows)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          key: dto.key.trim(),
          name: dto.name.trim(),
          description: dto.description?.trim(),
          status: 'DRAFT',
        })
        .returning();

      const [version] = await tx
        .insert(automationWorkflowVersions)
        .values({
          organizationId: principal.organizationId,
          workflowId: workflow.id,
          version: 1,
          status: 'DRAFT',
          triggerType,
          triggerConfig,
          maxSteps: 100,
          createdByMemberId: principal.membershipId,
        })
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'automation.workflow.create',
        resourceType: 'automation_workflow',
        resourceId: workflow.id,
        after: { workflow, version },
      });

      return { workflow, version };
    });
  }

  async createVersion(
    principal: Principal,
    workflowId: string,
    dto: CreateWorkflowVersionDto,
  ) {
    const workflow = await this.getWorkflow(principal, workflowId);
    this.validateTrigger(dto.triggerType, dto.triggerConfig);

    const current = await this.database.db
      .select({ version: max(automationWorkflowVersions.version) })
      .from(automationWorkflowVersions)
      .where(
        and(
          eq(
            automationWorkflowVersions.organizationId,
            principal.organizationId,
          ),
          eq(automationWorkflowVersions.workflowId, workflowId),
        ),
      );
    const nextVersion = (current[0]?.version ?? 0) + 1;

    const [version] = await this.database.db
      .insert(automationWorkflowVersions)
      .values({
        organizationId: principal.organizationId,
        workflowId,
        version: nextVersion,
        status: 'DRAFT',
        triggerType: dto.triggerType,
        triggerConfig: dto.triggerConfig,
        maxSteps: dto.maxSteps ?? 100,
        createdByMemberId: principal.membershipId,
      })
      .returning();

    const activeRows = await this.database.db
      .select()
      .from(automationWorkflowVersions)
      .where(
        and(
          eq(
            automationWorkflowVersions.organizationId,
            principal.organizationId,
          ),
          eq(automationWorkflowVersions.workflowId, workflowId),
          eq(automationWorkflowVersions.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    const active = activeRows[0];

    if (active) {
      const [nodes, edges] = await Promise.all([
        this.database.db
          .select()
          .from(automationNodes)
          .where(eq(automationNodes.workflowVersionId, active.id)),
        this.database.db
          .select()
          .from(automationEdges)
          .where(eq(automationEdges.workflowVersionId, active.id)),
      ]);

      await this.database.db.transaction(async (tx) => {
        if (nodes.length) {
          await tx.insert(automationNodes).values(
            nodes.map((node) => ({
              organizationId: principal.organizationId,
              workflowVersionId: version.id,
              nodeKey: node.nodeKey,
              nodeType: node.nodeType,
              name: node.name,
              config: node.config,
              positionX: node.positionX,
              positionY: node.positionY,
            })),
          );
        }
        if (edges.length) {
          await tx.insert(automationEdges).values(
            edges.map((edge) => ({
              organizationId: principal.organizationId,
              workflowVersionId: version.id,
              edgeKey: edge.edgeKey,
              sourceNodeKey: edge.sourceNodeKey,
              targetNodeKey: edge.targetNodeKey,
              branchKey: edge.branchKey,
              priority: edge.priority,
              config: edge.config,
            })),
          );
        }
        await tx
          .update(automationWorkflowVersions)
          .set({ startNodeKey: active.startNodeKey })
          .where(eq(automationWorkflowVersions.id, version.id));
      });
    }

    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      workspaceId: workflow.workspaceId,
      actorType: 'USER',
      actorId: principal.userId,
      action: 'automation.workflow.version.create',
      resourceType: 'automation_workflow_version',
      resourceId: version.id,
      after: version,
    });

    return version;
  }
  async saveGraph(
    principal: Principal,
    workflowId: string,
    versionId: string,
    dto: SaveWorkflowGraphDto,
  ) {
    const version = await this.getVersion(principal, workflowId, versionId);
    if (version.status !== 'DRAFT') {
      throw new ConflictException(
        'Only draft workflow versions can be edited.',
      );
    }

    this.validateGraph(dto);

    await this.database.db.transaction(async (tx) => {
      await tx
        .delete(automationEdges)
        .where(eq(automationEdges.workflowVersionId, versionId));
      await tx
        .delete(automationNodes)
        .where(eq(automationNodes.workflowVersionId, versionId));

      if (dto.nodes.length) {
        await tx.insert(automationNodes).values(
          dto.nodes.map((node) => ({
            organizationId: principal.organizationId,
            workflowVersionId: versionId,
            nodeKey: node.nodeKey,
            nodeType: node.nodeType,
            name: node.name.trim(),
            config: node.config,
            positionX: node.positionX ?? 0,
            positionY: node.positionY ?? 0,
          })),
        );
      }

      if (dto.edges.length) {
        await tx.insert(automationEdges).values(
          dto.edges.map((edge) => ({
            organizationId: principal.organizationId,
            workflowVersionId: versionId,
            edgeKey: edge.edgeKey,
            sourceNodeKey: edge.sourceNodeKey,
            targetNodeKey: edge.targetNodeKey,
            branchKey: edge.branchKey ?? 'DEFAULT',
            priority: edge.priority ?? 0,
            config: edge.config,
          })),
        );
      }

      await tx
        .update(automationWorkflowVersions)
        .set({
          startNodeKey: dto.startNodeKey,
          updatedAt: new Date(),
        })
        .where(eq(automationWorkflowVersions.id, versionId));
    });

    return this.getGraph(principal, workflowId, versionId);
  }

  async getGraph(
    principal: Principal,
    workflowId: string,
    versionId: string,
  ) {
    const version = await this.getVersion(principal, workflowId, versionId);
    const [nodes, edges] = await Promise.all([
      this.database.db
        .select()
        .from(automationNodes)
        .where(
          and(
            eq(automationNodes.organizationId, principal.organizationId),
            eq(automationNodes.workflowVersionId, versionId),
          ),
        )
        .orderBy(automationNodes.createdAt),
      this.database.db
        .select()
        .from(automationEdges)
        .where(
          and(
            eq(automationEdges.organizationId, principal.organizationId),
            eq(automationEdges.workflowVersionId, versionId),
          ),
        )
        .orderBy(automationEdges.priority, automationEdges.createdAt),
    ]);
    return { version, nodes, edges };
  }

  async activateVersion(
    principal: Principal,
    workflowId: string,
    versionId: string,
  ) {
    const workflow = await this.getWorkflow(principal, workflowId);
    const graph = await this.getGraph(principal, workflowId, versionId);
    if (graph.version.status !== 'DRAFT') {
      throw new ConflictException('Only draft versions can be activated.');
    }

    this.validateTrigger(
      graph.version.triggerType,
      graph.version.triggerConfig,
    );
    this.validateGraph({
      startNodeKey: graph.version.startNodeKey ?? '',
      nodes: graph.nodes,
      edges: graph.edges,
    });

    return this.database.db.transaction(async (tx) => {
      await tx
        .update(automationWorkflowVersions)
        .set({ status: 'ARCHIVED', updatedAt: new Date() })
        .where(
          and(
            eq(
              automationWorkflowVersions.organizationId,
              principal.organizationId,
            ),
            eq(automationWorkflowVersions.workflowId, workflowId),
            eq(automationWorkflowVersions.status, 'ACTIVE'),
          ),
        );

      const [active] = await tx
        .update(automationWorkflowVersions)
        .set({
          status: 'ACTIVE',
          activatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(automationWorkflowVersions.id, versionId))
        .returning();

      await tx
        .update(automationWorkflows)
        .set({ status: 'ACTIVE', updatedAt: new Date() })
        .where(eq(automationWorkflows.id, workflowId));

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'automation.workflow.version_activated.v1',
        aggregateType: 'automation_workflow',
        aggregateId: workflowId,
        payload: {
          workflowId,
          workflowVersionId: versionId,
          version: active.version,
        },
      });

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: workflow.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'automation.workflow.version.activate',
        resourceType: 'automation_workflow_version',
        resourceId: versionId,
        after: active,
      });

      return active;
    });
  }
  private validateTrigger(
    triggerType: string,
    triggerConfig: Record<string, unknown>,
  ) {
    if (triggerType === 'MANUAL') return;
    if (triggerType !== 'EVENT') {
      throw new BadRequestException('Unsupported automation trigger type.');
    }
    const eventTypes = triggerConfig.eventTypes;
    if (
      !Array.isArray(eventTypes) ||
      !eventTypes.length ||
      eventTypes.length > 50 ||
      eventTypes.some(
        (eventType) =>
          typeof eventType !== 'string' ||
          !eventType.trim() ||
          eventType.length > 180,
      )
    ) {
      throw new BadRequestException(
        'EVENT trigger requires 1-50 valid eventTypes.',
      );
    }
  }

  private validateGraph(dto: {
    startNodeKey: string;
    nodes: Array<{
      nodeKey: string;
      nodeType: string;
      config: Record<string, unknown>;
    }>;
    edges: Array<{
      edgeKey: string;
      sourceNodeKey: string;
      targetNodeKey: string;
      branchKey?: string;
    }>;
  }) {
    if (!dto.nodes.length) {
      throw new BadRequestException('Workflow graph requires at least one node.');
    }

    const nodeKeys = new Set<string>();
    for (const node of dto.nodes) {
      if (nodeKeys.has(node.nodeKey)) {
        throw new BadRequestException(
          'Workflow graph contains duplicate node keys.',
        );
      }
      nodeKeys.add(node.nodeKey);
      this.validateNode(node);
    }

    if (!dto.startNodeKey || !nodeKeys.has(dto.startNodeKey)) {
      throw new BadRequestException(
        'Workflow startNodeKey must reference an existing node.',
      );
    }
    if (!dto.nodes.some((node) => node.nodeType === 'END')) {
      throw new BadRequestException('Workflow graph requires an END node.');
    }

    const edgeKeys = new Set<string>();
    const outgoing = new Map<string, Array<{ target: string; branch: string }>>();
    for (const edge of dto.edges) {
      if (edgeKeys.has(edge.edgeKey)) {
        throw new BadRequestException(
          'Workflow graph contains duplicate edge keys.',
        );
      }
      edgeKeys.add(edge.edgeKey);
      if (
        !nodeKeys.has(edge.sourceNodeKey) ||
        !nodeKeys.has(edge.targetNodeKey)
      ) {
        throw new BadRequestException(
          'Workflow edge references an unknown node.',
        );
      }
      const list = outgoing.get(edge.sourceNodeKey) ?? [];
      list.push({
        target: edge.targetNodeKey,
        branch: edge.branchKey ?? 'DEFAULT',
      });
      outgoing.set(edge.sourceNodeKey, list);
    }

    for (const node of dto.nodes) {
      const edges = outgoing.get(node.nodeKey) ?? [];
      if (node.nodeType === 'END') {
        if (edges.length) {
          throw new BadRequestException('END nodes cannot have outgoing edges.');
        }
        continue;
      }
      if (!edges.length) {
        throw new BadRequestException(
          'Every non-END node must have an outgoing edge.',
        );
      }
      if (node.nodeType === 'CONDITION') {
        const branches = new Set(edges.map((edge) => edge.branch));
        if (!branches.has('TRUE') || !branches.has('FALSE')) {
          throw new BadRequestException(
            'CONDITION nodes require TRUE and FALSE edges.',
          );
        }
      } else if (node.nodeType === 'APPROVAL') {
        const branches = new Set(edges.map((edge) => edge.branch));
        if (!branches.has('APPROVED') || !branches.has('REJECTED')) {
          throw new BadRequestException(
            'APPROVAL nodes require APPROVED and REJECTED edges.',
          );
        }
      } else if (edges.length !== 1) {
        throw new BadRequestException(
          node.nodeType + ' nodes require exactly one outgoing edge.',
        );
      }
    }

    this.assertAcyclic(dto.startNodeKey, outgoing);
  }

  private validateNode(node: {
    nodeType: string;
    config: Record<string, unknown>;
  }) {
    if (node.nodeType === 'ACTION') {
      if (
        typeof node.config.action !== 'string' ||
        !ACTIONS.has(node.config.action)
      ) {
        throw new BadRequestException('ACTION node has unsupported action.');
      }
      if (
        node.config.input !== undefined &&
        (typeof node.config.input !== 'object' ||
          node.config.input === null ||
          Array.isArray(node.config.input))
      ) {
        throw new BadRequestException('ACTION input must be an object.');
      }
      return;
    }

    if (node.nodeType === 'WAIT') {
      const seconds = Number(node.config.durationSeconds);
      if (
        !Number.isInteger(seconds) ||
        seconds < 1 ||
        seconds > 2_592_000
      ) {
        throw new BadRequestException(
          'WAIT durationSeconds must be between 1 second and 30 days.',
        );
      }
      return;
    }

    if (node.nodeType === 'CONDITION') {
      if (
        typeof node.config.path !== 'string' ||
        !node.config.path.trim()
      ) {
        throw new BadRequestException('CONDITION path is required.');
      }
      const operators = new Set([
        'EQUALS',
        'NOT_EQUALS',
        'EXISTS',
        'IN',
        'GT',
        'GTE',
        'LT',
        'LTE',
      ]);
      if (
        typeof node.config.operator !== 'string' ||
        !operators.has(node.config.operator)
      ) {
        throw new BadRequestException(
          'CONDITION operator is unsupported.',
        );
      }
      return;
    }

    if (node.nodeType === 'APPROVAL') {
      if (
        typeof node.config.title !== 'string' ||
        !node.config.title.trim()
      ) {
        throw new BadRequestException('APPROVAL title is required.');
      }
      const expiry = node.config.expirySeconds;
      if (
        expiry !== undefined &&
        (!Number.isInteger(Number(expiry)) ||
          Number(expiry) < 60 ||
          Number(expiry) > 604_800)
      ) {
        throw new BadRequestException(
          'APPROVAL expirySeconds must be 60 seconds to 7 days.',
        );
      }
    }
  }

  private assertAcyclic(
    startNodeKey: string,
    outgoing: Map<string, Array<{ target: string }>>,
  ) {
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (nodeKey: string) => {
      if (visiting.has(nodeKey)) {
        throw new BadRequestException(
          'Workflow graph contains a cycle. Explicit loop nodes are not supported in Phase 5.',
        );
      }
      if (visited.has(nodeKey)) return;
      visiting.add(nodeKey);
      for (const edge of outgoing.get(nodeKey) ?? []) {
        visit(edge.target);
      }
      visiting.delete(nodeKey);
      visited.add(nodeKey);
    };

    visit(startNodeKey);
  }
}
