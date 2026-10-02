import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { CrmModule } from './modules/crm/crm.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module.js';
import { validateEnvironment } from './config/environment.js';
import { AuditModule } from './platform/audit/audit.module.js';
import { AuthModule } from './platform/auth/auth.module.js';
import { JwtAuthGuard } from './platform/auth/jwt-auth.guard.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { EntitlementsModule } from './platform/entitlements/entitlements.module.js';
import { FeatureFlagsModule } from './platform/features/feature-flags.module.js';
import { OutboxModule } from './platform/outbox/outbox.module.js';
import { PermissionsGuard } from './platform/permissions/permissions.guard.js';
import { PermissionsModule } from './platform/permissions/permissions.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    PermissionsModule,
    EntitlementsModule,
    AuditModule,
    FeatureFlagsModule,
    OutboxModule,
    AuthModule,
    HealthModule,
    CrmModule,
    OrganizationsModule,
    PlatformAdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
