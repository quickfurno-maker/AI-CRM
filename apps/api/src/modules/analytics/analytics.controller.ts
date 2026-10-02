import { Controller, Get, Query } from '@nestjs/common';
import type { Principal } from '../../platform/auth/auth.types.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { RequirePermission } from '../../platform/permissions/require-permission.decorator.js';
import { AnalyticsRangeQueryDto } from '../business-billing/dto/business-billing.dto.js';
import { AnalyticsService } from './analytics.service.js';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @RequirePermission('analytics.read')
  overview(
    @CurrentPrincipal() principal: Principal,
    @Query() query: AnalyticsRangeQueryDto,
  ) {
    return this.analytics.overview(principal, query);
  }
}
