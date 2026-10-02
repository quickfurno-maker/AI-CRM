import { Controller, Get, UseGuards } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { DatabaseService } from '../../platform/database/database.service.js';
import { organizations } from '../../platform/database/schema.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

@Controller('platform-admin')
@UseGuards(PlatformAdminGuard)
export class PlatformAdminController {
  constructor(private readonly database: DatabaseService) {}

  @Get('organizations')
  listOrganizations() {
    return this.database.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        status: organizations.status,
        createdAt: organizations.createdAt,
      })
      .from(organizations)
      .orderBy(desc(organizations.createdAt))
      .limit(100);
  }
}
