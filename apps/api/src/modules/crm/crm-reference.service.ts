import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  companies,
  contacts,
  deals,
  leads,
  pipelineStages,
  pipelines,
} from './crm.schema.js';

@Injectable()
export class CrmReferenceService {
  constructor(private readonly database: DatabaseService) {}

  private async exists(
    organizationId: string,
    kind: 'contact' | 'company' | 'lead' | 'deal',
    id?: string,
  ) {
    if (!id) return undefined;
    const table = { contact: contacts, company: companies, lead: leads, deal: deals }[kind];
    const rows = await this.database.db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.organizationId, organizationId), eq(table.id, id)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException(`${kind} not found.`);
    return id;
  }

  contact(org: string, id?: string) { return this.exists(org, 'contact', id); }
  company(org: string, id?: string) { return this.exists(org, 'company', id); }
  lead(org: string, id?: string) { return this.exists(org, 'lead', id); }
  deal(org: string, id?: string) { return this.exists(org, 'deal', id); }

  async stage(
    organizationId: string,
    pipelineId: string,
    stageId: string,
  ) {
    const rows = await this.database.db
      .select({
        id: pipelineStages.id,
        key: pipelineStages.key,
        stageType: pipelineStages.stageType,
        probability: pipelineStages.probability,
      })
      .from(pipelineStages)
      .innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId))
      .where(
        and(
          eq(pipelineStages.organizationId, organizationId),
          eq(pipelineStages.id, stageId),
          eq(pipelineStages.pipelineId, pipelineId),
          eq(pipelines.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Pipeline stage not found.');
    return rows[0];
  }
}
