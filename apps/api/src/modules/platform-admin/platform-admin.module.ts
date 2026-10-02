import { Module } from '@nestjs/common';
import { DeveloperModule } from '../developer/developer.module.js';
import { PlatformAdminController } from './platform-admin.controller.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

@Module({
  imports: [DeveloperModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminGuard],
})
export class PlatformAdminModule {}
