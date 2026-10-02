import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import {
  memberRoles,
  permissions,
  rolePermissions,
  roles,
} from '../database/schema.js';

export type PermissionScope =
  | 'OWN'
  | 'TEAM'
  | 'BRANCH'
  | 'WORKSPACE'
  | 'ORGANIZATION';

const SCOPE_STRENGTH: Record<PermissionScope, number> = {
  OWN: 1,
  TEAM: 2,
  BRANCH: 3,
  WORKSPACE: 4,
  ORGANIZATION: 5,
};

@Injectable()
export class PermissionsService {
  constructor(private readonly database: DatabaseService) {}

  async getPermissionScope(input: {
    organizationId: string;
    membershipId: string;
    permission: string;
  }): Promise<PermissionScope | undefined> {
    const rows = await this.database.db
      .select({ scope: rolePermissions.scope })
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
      );

    const scopes = rows
      .map((row) => row.scope as PermissionScope)
      .filter((scope) => scope in SCOPE_STRENGTH);
    return scopes.sort(
      (a, b) => SCOPE_STRENGTH[b] - SCOPE_STRENGTH[a],
    )[0];
  }

  async hasOrganizationPermission(input: {
    organizationId: string;
    membershipId: string;
    permission: string;
  }): Promise<boolean> {
    return (await this.getPermissionScope(input)) === 'ORGANIZATION';
  }
}
