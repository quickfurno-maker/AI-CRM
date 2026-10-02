import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import {
  permissions,
  rolePermissions,
  roles,
} from '../database/schema.js';
import { CORE_PERMISSIONS } from './permissions.constants.js';

@Injectable()
export class PermissionsBootstrapService implements OnApplicationBootstrap {
  constructor(private readonly database: DatabaseService) {}

  async onApplicationBootstrap() {
    for (const permission of CORE_PERMISSIONS) {
      await this.database.db
        .insert(permissions)
        .values(permission)
        .onConflictDoUpdate({
          target: permissions.key,
          set: { description: permission.description },
        });
    }

    const permissionRows = await this.database.db
      .select({ id: permissions.id })
      .from(permissions);
    const ownerRoles = await this.database.db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.key, 'owner'), eq(roles.isSystem, true)));

    for (const role of ownerRoles) {
      for (const permission of permissionRows) {
        await this.database.db
          .insert(rolePermissions)
          .values({
            roleId: role.id,
            permissionId: permission.id,
            scope: 'ORGANIZATION',
          })
          .onConflictDoNothing();
      }
    }
  }
}
