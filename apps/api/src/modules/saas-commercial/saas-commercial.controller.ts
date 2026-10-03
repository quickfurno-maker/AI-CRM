import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import type { Principal } from '../../platform/auth/auth.types.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { Public } from '../../platform/auth/public.decorator.js';
import { RequirePermission } from '../../platform/permissions/require-permission.decorator.js';
import {
  CancelSubscriptionDto,
  ChangeAddonDto,
  CreateAddonCheckoutDto,
  CreatePlanCheckoutDto,
  SchedulePlanChangeDto,
  StartTrialDto,
  UpsertSaasBillingProfileDto,
} from './saas-commercial.dto.js';
import { SaasCommercialService } from './saas-commercial.service.js';

@Controller('saas')
export class SaasCommercialController {
  constructor(private readonly commercial: SaasCommercialService) {}

  @Public()
  @Get('catalog')
  catalog() {
    return this.commercial.customerCatalog();
  }

  @Get('portal')
  @RequirePermission('billing.read')
  portal(@CurrentPrincipal() principal: Principal) {
    return this.commercial.portal(principal);
  }

  @Put('billing-profile')
  @RequirePermission('billing.manage')
  billingProfile(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: UpsertSaasBillingProfileDto,
  ) {
    return this.commercial.upsertBillingProfile(principal, dto);
  }

  @Post('trials')
  @RequirePermission('billing.manage')
  trial(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: StartTrialDto,
  ) {
    return this.commercial.startTrial(principal, dto);
  }

  @Post('checkouts/plan')
  @RequirePermission('billing.manage')
  planCheckout(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreatePlanCheckoutDto,
  ) {
    return this.commercial.createPlanCheckout(principal, dto);
  }

  @Post('checkouts/addon')
  @RequirePermission('billing.manage')
  addonCheckout(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateAddonCheckoutDto,
  ) {
    return this.commercial.createAddonCheckout(principal, dto);
  }

  @Post('subscription/change-plan')
  @RequirePermission('billing.manage')
  changePlan(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: SchedulePlanChangeDto,
  ) {
    return this.commercial.schedulePlanChange(principal, dto);
  }

  @Post('subscription/cancel')
  @RequirePermission('billing.manage')
  cancel(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CancelSubscriptionDto,
  ) {
    return this.commercial.cancelSubscription(principal, dto);
  }

  @Post('subscription/reactivate')
  @RequirePermission('billing.manage')
  reactivate(@CurrentPrincipal() principal: Principal) {
    return this.commercial.reactivateSubscription(principal);
  }

  @Put('subscription/addons/:id')
  @RequirePermission('billing.manage')
  addonQuantity(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeAddonDto,
  ) {
    return this.commercial.scheduleAddonQuantity(
      principal,
      id,
      dto,
    );
  }

  @Get('usage')
  @RequirePermission('billing.read')
  usage(@CurrentPrincipal() principal: Principal) {
    return this.commercial.usageSummary(principal);
  }

  @Get('invoices')
  @RequirePermission('billing.read')
  invoices(@CurrentPrincipal() principal: Principal) {
    return this.commercial.listInvoices(principal);
  }

  @Get('receipts')
  @RequirePermission('billing.read')
  receipts(@CurrentPrincipal() principal: Principal) {
    return this.commercial.listReceipts(principal);
  }
}
