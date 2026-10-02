import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import {
  memberRoles,
  permissions,
  rolePermissions,
  roles,
} from '../database/schema.js';

@Injectable()
export class PermissionsService {
  constructor(private readonly database: DatabaseService) {}

  async hasPermission(input: {
    organizationId: string;
    membershipId: string;
    permission: string;
  }): Promise<boolean> {
    const rows = await this.database.db
      .select({ permission: permissions.key })
      .from(memberRoles)
      .innerJoin(roles, eq(roles.id, memberRoles.roleId))
      .innerJoin(
        rolePermissions,
        eq(rolePermissions.roleId, memberRoles.roleId),
      )
      .innerJoin(
        permissions,
        eq(permissions.id, rolePermissions.permissionId),
      )
      .where(
        and(
          eq(memberRoles.organizationId, input.organizationId),
          eq(memberRoles.organizationMemberId, input.membershipId),
          eq(roles.organizationId, input.organizationId),
          eq(permissions.key, input.permission),
        ),
      )
      .limit(1);

    return rows.length > 0;
  }
}
