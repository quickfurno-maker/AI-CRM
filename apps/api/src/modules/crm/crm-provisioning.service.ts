import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  organizationMembers,
  workspaces,
} from '../../platform/database/schema.js';
import {
  pipelineStages,
  pipelines,
} from './crm.schema.js';

const PIPELINES = [
  {
    objectType: 'LEAD',
    key: 'lead-qualification',
    name: 'Lead Qualification',
    stages: [
      ['new', 'New', 'OPEN', 0],
      ['contacted', 'Contacted', 'OPEN', 15],
      ['qualified', 'Qualified', 'OPEN', 60],
      ['unqualified', 'Unqualified', 'LOST', 0],
    ],
  },
  {
    objectType: 'DEAL',
    key: 'sales',
    name: 'Sales Pipeline',
    stages: [
      ['new', 'New', 'OPEN', 10],
      ['discovery', 'Discovery', 'OPEN', 25],
      ['proposal', 'Proposal', 'OPEN', 50],
      ['negotiation', 'Negotiation', 'OPEN', 75],
      ['won', 'Won', 'WON', 100],
      ['lost', 'Lost', 'LOST', 0],
    ],
  },
] as const;

@Injectable()
export class CrmProvisioningService {
  constructor(private readonly database: DatabaseService) {}

  async resolveWorkspace(organizationId: string, requestedId?: string) {
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

    const workspace = rows[0];
    if (!workspace) throw new NotFoundException('Workspace not found.');
    return workspace.id;
  }

  async assertMember(organizationId: string, memberId?: string) {
    if (!memberId) return undefined;
    const rows = await this.database.db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.id, memberId),
          eq(organizationMembers.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Organization member not found.');
    return memberId;
  }

  async ensureDefaultPipelines(organizationId: string, workspaceId: string) {
    for (const definition of PIPELINES) {
      const existing = await this.database.db
        .select({ id: pipelines.id })
        .from(pipelines)
        .where(
          and(
            eq(pipelines.organizationId, organizationId),
            eq(pipelines.workspaceId, workspaceId),
            eq(pipelines.key, definition.key),
          ),
        )
        .limit(1);

      let pipelineId = existing[0]?.id;
      if (!pipelineId) {
        const created = await this.database.db
          .insert(pipelines)
          .values({
            organizationId,
            workspaceId,
            objectType: definition.objectType,
            key: definition.key,
            name: definition.name,
            isDefault: true,
          })
          .onConflictDoNothing()
          .returning({ id: pipelines.id });
        pipelineId = created[0]?.id;
      }

      if (!pipelineId) {
        const rows = await this.database.db
          .select({ id: pipelines.id })
          .from(pipelines)
          .where(
            and(
              eq(pipelines.organizationId, organizationId),
              eq(pipelines.workspaceId, workspaceId),
              eq(pipelines.key, definition.key),
            ),
          )
          .limit(1);
        pipelineId = rows[0]?.id;
      }
      if (!pipelineId) throw new Error('Failed to provision CRM pipeline.');

      for (const [position, stage] of definition.stages.entries()) {
        const [key, name, stageType, probability] = stage;
        await this.database.db
          .insert(pipelineStages)
          .values({
            organizationId,
            pipelineId,
            key,
            name,
            position,
            stageType,
            probability,
          })
          .onConflictDoNothing();
      }
    }
  }
  async getDefaultPipeline(
    organizationId: string,
    workspaceId: string,
    objectType: 'LEAD' | 'DEAL',
  ) {
    await this.ensureDefaultPipelines(organizationId, workspaceId);
    const rows = await this.database.db
      .select({
        id: pipelines.id,
        name: pipelines.name,
        key: pipelines.key,
      })
      .from(pipelines)
      .where(
        and(
          eq(pipelines.organizationId, organizationId),
          eq(pipelines.workspaceId, workspaceId),
          eq(pipelines.objectType, objectType),
          eq(pipelines.isDefault, true),
        ),
      )
      .limit(1);
    const pipeline = rows[0];
    if (!pipeline) throw new NotFoundException('Default pipeline not found.');

    const stages = await this.database.db
      .select()
      .from(pipelineStages)
      .where(
        and(
          eq(pipelineStages.organizationId, organizationId),
          eq(pipelineStages.pipelineId, pipeline.id),
        ),
      )
      .orderBy(asc(pipelineStages.position));

    return { ...pipeline, stages };
  }
}
