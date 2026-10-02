import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, max } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  auditLogs,
  outboxEvents,
} from '../../platform/database/schema.js';
import {
  aiAgentToolPolicies,
  aiAgentVersions,
  aiAgents,
  aiToolDefinitions,
} from './ai.schema.js';
import { AiProvisioningService } from './ai-provisioning.service.js';
import type {
  CreateAgentDto,
  CreateAgentVersionDto,
  SetAgentToolPolicyDto,
} from './dto/ai.dto.js';

@Injectable()
export class AiManagementService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly provisioning: AiProvisioningService,
  ) {}

  private promptHash(instructions: string) {
    return createHash('sha256').update(instructions).digest('hex');
  }

  private defaultModel() {
    return this.config.get<string>('AI_OPENAI_FAST_MODEL') ?? 'gpt-6-luna';
  }

  listAgents(principal: Principal) {
    return this.database.db
      .select()
      .from(aiAgents)
      .where(eq(aiAgents.organizationId, principal.organizationId))
      .orderBy(desc(aiAgents.updatedAt));
  }

  async getAgent(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(aiAgents)
      .where(
        and(
          eq(aiAgents.organizationId, principal.organizationId),
          eq(aiAgents.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('AI agent not found.');
    return rows[0];
  }
  listVersions(principal: Principal, agentId: string) {
    return this.database.db
      .select()
      .from(aiAgentVersions)
      .where(
        and(
          eq(aiAgentVersions.organizationId, principal.organizationId),
          eq(aiAgentVersions.agentId, agentId),
        ),
      )
      .orderBy(desc(aiAgentVersions.version));
  }

  async getVersion(
    principal: Principal,
    agentId: string,
    versionId: string,
  ) {
    const rows = await this.database.db
      .select()
      .from(aiAgentVersions)
      .where(
        and(
          eq(aiAgentVersions.organizationId, principal.organizationId),
          eq(aiAgentVersions.agentId, agentId),
          eq(aiAgentVersions.id, versionId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('AI agent version not found.');
    return rows[0];
  }

  async getActiveVersion(principal: Principal, agentId: string) {
    const rows = await this.database.db
      .select()
      .from(aiAgentVersions)
      .where(
        and(
          eq(aiAgentVersions.organizationId, principal.organizationId),
          eq(aiAgentVersions.agentId, agentId),
          eq(aiAgentVersions.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new ConflictException(
        'AI agent does not have an active version.',
      );
    }
    return rows[0];
  }

  async createAgent(principal: Principal, dto: CreateAgentDto) {
    const workspaceId = await this.provisioning.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    const model = dto.model?.trim() || this.defaultModel();
    const instructions = dto.instructions.trim();

    return this.database.db.transaction(async (tx) => {
      const [agent] = await tx
        .insert(aiAgents)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          key: dto.key.trim(),
          name: dto.name.trim(),
          role: dto.role.trim(),
          description: dto.description?.trim(),
          status: 'DRAFT',
          defaultHandlingMode: dto.defaultHandlingMode ?? 'AI_ASSIST',
        })
        .returning();

      const [version] = await tx
        .insert(aiAgentVersions)
        .values({
          organizationId: principal.organizationId,
          agentId: agent.id,
          version: 1,
          status: 'DRAFT',
          provider: 'OPENAI',
          model,
          instructions,
          promptHash: this.promptHash(instructions),
          createdByMemberId: principal.membershipId,
        })
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'ai.agent.create',
        resourceType: 'ai_agent',
        resourceId: agent.id,
        after: { agent, version },
      });

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'ai.agent.created.v1',
        aggregateType: 'ai_agent',
        aggregateId: agent.id,
        payload: { agentId: agent.id, versionId: version.id },
      });

      return { agent, version };
    });
  }
  async createVersion(
    principal: Principal,
    agentId: string,
    dto: CreateAgentVersionDto,
  ) {
    const agent = await this.getAgent(principal, agentId);
    const current = await this.database.db
      .select({ version: max(aiAgentVersions.version) })
      .from(aiAgentVersions)
      .where(
        and(
          eq(aiAgentVersions.organizationId, principal.organizationId),
          eq(aiAgentVersions.agentId, agentId),
        ),
      );
    const nextVersion = (current[0]?.version ?? 0) + 1;
    const instructions = dto.instructions.trim();

    return this.database.db.transaction(async (tx) => {
      const [version] = await tx
        .insert(aiAgentVersions)
        .values({
          organizationId: principal.organizationId,
          agentId,
          version: nextVersion,
          status: 'DRAFT',
          provider: 'OPENAI',
          model: dto.model?.trim() || this.defaultModel(),
          instructions,
          modelSettings: dto.modelSettings,
          knowledgePolicy: dto.knowledgePolicy,
          guardrailPolicy: dto.guardrailPolicy,
          approvalPolicy: dto.approvalPolicy,
          promptHash: this.promptHash(instructions),
          createdByMemberId: principal.membershipId,
        })
        .returning();

      const source = await tx
        .select({
          toolDefinitionId: aiAgentToolPolicies.toolDefinitionId,
          mode: aiAgentToolPolicies.mode,
          dataScope: aiAgentToolPolicies.dataScope,
          constraints: aiAgentToolPolicies.constraints,
        })
        .from(aiAgentToolPolicies)
        .innerJoin(
          aiAgentVersions,
          eq(aiAgentVersions.id, aiAgentToolPolicies.agentVersionId),
        )
        .where(
          and(
            eq(aiAgentToolPolicies.organizationId, principal.organizationId),
            eq(aiAgentVersions.agentId, agentId),
            eq(aiAgentVersions.status, 'ACTIVE'),
          ),
        );

      if (source.length) {
        await tx.insert(aiAgentToolPolicies).values(
          source.map((policy) => ({
            organizationId: principal.organizationId,
            agentVersionId: version.id,
            toolDefinitionId: policy.toolDefinitionId,
            mode: policy.mode,
            dataScope: policy.dataScope,
            constraints: policy.constraints,
          })),
        );
      }

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: agent.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'ai.agent.version.create',
        resourceType: 'ai_agent_version',
        resourceId: version.id,
        after: version,
      });

      return version;
    });
  }
  async activateVersion(
    principal: Principal,
    agentId: string,
    versionId: string,
  ) {
    const agent = await this.getAgent(principal, agentId);
    const version = await this.getVersion(principal, agentId, versionId);
    if (version.status === 'ARCHIVED') {
      throw new ConflictException('Archived versions cannot be activated.');
    }

    return this.database.db.transaction(async (tx) => {
      await tx
        .update(aiAgentVersions)
        .set({ status: 'ARCHIVED', updatedAt: new Date() })
        .where(
          and(
            eq(aiAgentVersions.organizationId, principal.organizationId),
            eq(aiAgentVersions.agentId, agentId),
            eq(aiAgentVersions.status, 'ACTIVE'),
          ),
        );

      const [active] = await tx
        .update(aiAgentVersions)
        .set({
          status: 'ACTIVE',
          activatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiAgentVersions.organizationId, principal.organizationId),
            eq(aiAgentVersions.id, versionId),
          ),
        )
        .returning();

      await tx
        .update(aiAgents)
        .set({ status: 'ACTIVE', updatedAt: new Date() })
        .where(eq(aiAgents.id, agentId));

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: agent.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'ai.agent.version.activate',
        resourceType: 'ai_agent_version',
        resourceId: versionId,
        before: version,
        after: active,
      });

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'ai.agent.version_activated.v1',
        aggregateType: 'ai_agent',
        aggregateId: agentId,
        payload: { agentId, versionId },
      });

      return active;
    });
  }
  listAvailableTools() {
    return this.database.db
      .select({
        id: aiToolDefinitions.id,
        key: aiToolDefinitions.key,
        name: aiToolDefinitions.name,
        description: aiToolDefinitions.description,
        riskLevel: aiToolDefinitions.riskLevel,
        inputSchema: aiToolDefinitions.inputSchema,
      })
      .from(aiToolDefinitions)
      .where(eq(aiToolDefinitions.isActive, true));
  }

  async setToolPolicy(
    principal: Principal,
    agentId: string,
    versionId: string,
    dto: SetAgentToolPolicyDto,
  ) {
    const version = await this.getVersion(principal, agentId, versionId);
    if (version.status === 'ARCHIVED') {
      throw new ConflictException('Archived agent versions are immutable.');
    }

    const tools = await this.database.db
      .select()
      .from(aiToolDefinitions)
      .where(
        and(
          eq(aiToolDefinitions.key, dto.toolKey),
          eq(aiToolDefinitions.isActive, true),
        ),
      )
      .limit(1);
    const tool = tools[0];
    if (!tool) throw new NotFoundException('AI tool not found.');

    if (tool.riskLevel === 'L3' && dto.mode === 'AUTO') {
      throw new ConflictException(
        'L3 tools cannot be configured for automatic execution.',
      );
    }

    const [policy] = await this.database.db
      .insert(aiAgentToolPolicies)
      .values({
        organizationId: principal.organizationId,
        agentVersionId: versionId,
        toolDefinitionId: tool.id,
        mode: dto.mode,
        dataScope: dto.dataScope ?? 'ORGANIZATION',
        constraints: dto.constraints,
      })
      .onConflictDoUpdate({
        target: [
          aiAgentToolPolicies.agentVersionId,
          aiAgentToolPolicies.toolDefinitionId,
        ],
        set: {
          mode: dto.mode,
          dataScope: dto.dataScope ?? 'ORGANIZATION',
          constraints: dto.constraints,
          updatedAt: new Date(),
        },
      })
      .returning();

    return { policy, tool };
  }

  async listToolPolicies(
    principal: Principal,
    agentId: string,
    versionId: string,
  ) {
    await this.getVersion(principal, agentId, versionId);
    return this.database.db
      .select({
        id: aiAgentToolPolicies.id,
        toolKey: aiToolDefinitions.key,
        toolName: aiToolDefinitions.name,
        description: aiToolDefinitions.description,
        riskLevel: aiToolDefinitions.riskLevel,
        mode: aiAgentToolPolicies.mode,
        dataScope: aiAgentToolPolicies.dataScope,
        constraints: aiAgentToolPolicies.constraints,
      })
      .from(aiAgentToolPolicies)
      .innerJoin(
        aiToolDefinitions,
        eq(aiToolDefinitions.id, aiAgentToolPolicies.toolDefinitionId),
      )
      .where(
        and(
          eq(aiAgentToolPolicies.organizationId, principal.organizationId),
          eq(aiAgentToolPolicies.agentVersionId, versionId),
        ),
      );
  }
}
