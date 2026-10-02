import { Controller, Get, Query } from '@nestjs/common';
import type { Principal } from '../auth/auth.types.js';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { AuditService } from './audit.service.js';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('audit.read')
  list(@CurrentPrincipal() principal: Principal, @Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '50', 10);
    return this.audit.list(principal.organizationId, Number.isFinite(parsed) ? parsed : 50);
  }
}
