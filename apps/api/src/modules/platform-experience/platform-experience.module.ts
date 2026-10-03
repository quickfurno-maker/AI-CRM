import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module.js';
import {
  PlatformExperienceAdminController,
  PlatformExperienceController,
} from './platform-experience.controller.js';
import { PlatformExperienceService } from './platform-experience.service.js';

@Module({
  imports: [CrmModule],
  controllers: [
    PlatformExperienceController,
    PlatformExperienceAdminController,
  ],
  providers: [PlatformExperienceService],
  exports: [PlatformExperienceService],
})
export class PlatformExperienceModule {}
