import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AiModule } from './modules/ai/ai.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { AutomationModule } from './modules/automation/automation.module.js';
import { BusinessBillingModule } from './modules/business-billing/business-billing.module.js';
import { AttendanceModule } from './extensions/attendance/attendance.module.js';
import { RealEstateModule } from './extensions/real-estate/real-estate.module.js';
import { CommunicationModule } from './modules/communication/communication.module.js';
import { CrmModule } from './modules/crm/crm.module.js';
import { DeveloperModule } from './modules/developer/developer.module.js';
import { EnterpriseModule } from './modules/enterprise/enterprise.module.js';
import { EnterpriseSecurityGuard } from './modules/enterprise/enterprise-security.guard.js';
import { HealthModule } from './modules/health/health.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { StaffModule } from './modules/staff/staff.module.js';
import { TeamAdminModule } from './modules/team-admin/team-admin.module.js';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module.js';
import { validateEnvironment } from './config/environment.js';
import { AuditModule } from './platform/audit/audit.module.js';
import { AuthModule } from './platform/auth/auth.module.js';
import { JwtAuthGuard } from './platform/auth/jwt-auth.guard.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { EntitlementsModule } from './platform/entitlements/entitlements.module.js';
import { FeatureFlagsModule } from './platform/features/feature-flags.module.js';
import { EntitlementGuard } from './platform/extensions/entitlement.guard.js';
import { ExtensionsModule } from './platform/extensions/extensions.module.js';
import { OutboxModule } from './platform/outbox/outbox.module.js';
import { PermissionsGuard } from './platform/permissions/permissions.guard.js';
import { PermissionsModule } from './platform/permissions/permissions.module.js';
import { SecurityModule } from './platform/security/security.module.js';

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
    SecurityModule,
    FeatureFlagsModule,
    ExtensionsModule,
    OutboxModule,
    AuthModule,
    HealthModule,
    CrmModule,
    DeveloperModule,
    EnterpriseModule,
    CommunicationModule,
    AiModule,
    AnalyticsModule,
    AutomationModule,
    BusinessBillingModule,
    RealEstateModule,
    AttendanceModule,
    StaffModule,
    TeamAdminModule,
    OrganizationsModule,
    PlatformAdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: EnterpriseSecurityGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: EntitlementGuard },
  ],
})
export class AppModule {}
