import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Principal } from '../../platform/auth/auth.types.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { PlatformAdminGuard } from '../platform-admin/platform-admin.guard.js';
import {
  CompleteCheckoutDto,
  ConfigureAddonDto,
  ConfigureAddonPriceDto,
  ConfigureCouponDto,
  ConfigureMeterPriceDto,
  ConfigurePlanDto,
  ConfigurePlanPriceDto,
  FailCheckoutDto,
  ReconcileInvoicePaymentDto,
  RecordUsageDto,
} from './saas-commercial.dto.js';
import { SaasCommercialAdminService } from './saas-commercial-admin.service.js';
import { SaasCommercialService } from './saas-commercial.service.js';
import { SaasUsageMeterService } from './saas-usage-meter.service.js';

@Controller('platform-admin/saas')
@UseGuards(PlatformAdminGuard)
export class SaasCommercialAdminController {
  constructor(
    private readonly admin: SaasCommercialAdminService,
    private readonly commercial: SaasCommercialService,
    private readonly usage: SaasUsageMeterService,
  ) {}

  @Get('catalog')
  catalog() {
    return this.admin.catalog();
  }

  @Post('plans')
  plan(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: ConfigurePlanDto,
  ) {
    return this.admin.configurePlan(principal, dto);
  }

  @Post('plan-prices')
  planPrice(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: ConfigurePlanPriceDto,
  ) {
    return this.admin.configurePlanPrice(principal, dto);
  }

  @Post('meters')
  meter(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: ConfigureMeterPriceDto,
  ) {
    return this.admin.configureMeter(principal, dto);
  }

  @Post('addons')
  addon(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: ConfigureAddonDto,
  ) {
    return this.admin.configureAddon(principal, dto);
  }

  @Post('addon-prices')
  addonPrice(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: ConfigureAddonPriceDto,
  ) {
    return this.admin.configureAddonPrice(principal, dto);
  }

  @Post('coupons')
  coupon(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: ConfigureCouponDto,
  ) {
    return this.admin.configureCoupon(principal, dto);
  }

  @Get('metrics')
  metrics(@CurrentPrincipal() principal: Principal) {
    return this.admin.metrics(principal);
  }

  @Post('checkouts/:id/complete')
  completeCheckout(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteCheckoutDto,
  ) {
    return this.commercial.completeCheckout(principal, id, dto);
  }

  @Post('checkouts/:id/fail')
  failCheckout(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FailCheckoutDto,
  ) {
    return this.commercial.failCheckout(principal, id, dto);
  }

  @Post('invoices/:id/payments')
  reconcileInvoicePayment(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReconcileInvoicePaymentDto,
  ) {
    return this.commercial.reconcileInvoicePayment(
      principal,
      id,
      dto,
    );
  }

  @Post('usage')
  recordUsage(@Body() dto: RecordUsageDto) {
    return this.usage.record({
      organizationId: dto.organizationId,
      meterKey: dto.meterKey,
      quantity: dto.quantity,
      unit: dto.unit,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      idempotencyKey: dto.idempotencyKey,
      metadata: dto.metadata,
    });
  }
}
