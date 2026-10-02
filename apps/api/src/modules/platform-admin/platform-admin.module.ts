import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

@Module({
  controllers: [PlatformAdminController],
  providers: [PlatformAdminGuard],
})
export class PlatformAdminModule {}
