import { Module } from '@nestjs/common';
import { TeamAdminController } from './team-admin.controller.js';
import { TeamAdminService } from './team-admin.service.js';

@Module({
  controllers: [TeamAdminController],
  providers: [TeamAdminService],
  exports: [TeamAdminService],
})
export class TeamAdminModule {}
