import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../platform/database/database.service.js';
import { branches, organizations, teams, workspaces } from '../../platform/database/schema.js';

@Injectable()
export class OrganizationsService {
  constructor(private readonly database: DatabaseService) {}

  async getCurrent(organizationId: string) {
    const [orgRows, workspaceRows, branchRows, teamRows] = await Promise.all([
      this.database.db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1),
      this.database.db.select().from(workspaces).where(eq(workspaces.organizationId, organizationId)),
      this.database.db.select().from(branches).where(eq(branches.organizationId, organizationId)),
      this.database.db.select().from(teams).where(eq(teams.organizationId, organizationId)),
    ]);

    const organization = orgRows[0];
    if (!organization) throw new NotFoundException('Organization not found.');

    return {
      organization,
      workspaces: workspaceRows,
      branches: branchRows,
      teams: teamRows,
    };
  }
}
