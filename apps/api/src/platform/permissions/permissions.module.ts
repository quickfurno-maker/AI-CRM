import { Global, Module } from '@nestjs/common';
import { PermissionsBootstrapService } from './permissions.bootstrap.js';
import { PermissionsService } from './permissions.service.js';

@Global()
@Module({
  providers: [PermissionsService, PermissionsBootstrapService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
