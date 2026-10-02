import {
  Injectable,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { permissions } from '../database/schema.js';
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
  }
}
