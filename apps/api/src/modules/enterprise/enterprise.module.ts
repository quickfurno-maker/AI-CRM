import { Module } from '@nestjs/common';
import { AuthModule } from '../../platform/auth/auth.module.js';
import {
  EnterpriseController,
  EnterpriseOidcController,
  ScimController,
} from './enterprise.controller.js';
import { EnterpriseService } from './enterprise.service.js';

@Module({
  imports: [AuthModule],
  controllers: [EnterpriseController, EnterpriseOidcController, ScimController],
  providers: [EnterpriseService],
  exports: [EnterpriseService],
})
export class EnterpriseModule {}
