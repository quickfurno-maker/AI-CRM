import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type { Principal } from '../../platform/auth/auth.types.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { Public } from '../../platform/auth/public.decorator.js';
import { RequirePermission } from '../../platform/permissions/require-permission.decorator.js';
import { PlatformAdminGuard } from '../platform-admin/platform-admin.guard.js';
import {
  ConfirmGatewayPaymentDto,
  RefundGatewayPaymentDto,
} from './payment-gateway.dto.js';
import { PaymentGatewayService } from './payment-gateway.service.js';

@Controller('saas')
export class PaymentGatewayController {
  constructor(private readonly payments: PaymentGatewayService) {}

  @Get('payment-gateway')
  @RequirePermission('billing.read')
  status() {
    return this.payments.status();
  }

  @Get('payment-methods')
  @RequirePermission('billing.read')
  paymentMethods(@CurrentPrincipal() principal: Principal) {
    return this.payments.paymentMethods(principal);
  }

  @Post('checkouts/:id/payment-intent')
  @RequirePermission('billing.manage')
  checkoutIntent(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payments.createCheckoutIntent(principal, id);
  }

  @Post('invoices/:id/payment-intent')
  @RequirePermission('billing.manage')
  invoiceIntent(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payments.createInvoiceIntent(principal, id);
  }

  @Post('checkouts/:id/payment-confirmation')
  @RequirePermission('billing.manage')
  confirm(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmGatewayPaymentDto,
  ) {
    return this.payments.confirmCheckout(principal, id, dto);
  }

  @Post('invoices/:id/payment-confirmation')
  @RequirePermission('billing.manage')
  confirmInvoice(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmGatewayPaymentDto,
  ) {
    return this.payments.confirmInvoice(principal, id, dto);
  }

  @Public()
  @Post('payment-webhooks/:provider')
  webhook(
    @Param('provider') provider: string,
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') razorpaySignature?: string,
    @Headers('x-payment-signature') genericSignature?: string,
    @Headers('x-razorpay-event-id') eventId?: string,
  ) {
    if (!request.rawBody) {
      throw new Error('Raw webhook body is unavailable.');
    }
    return this.payments.handleWebhook(
      provider,
      request.rawBody,
      razorpaySignature ?? genericSignature,
      eventId,
    );
  }
}

@Controller('platform-admin/saas/payment-gateway')
@UseGuards(PlatformAdminGuard)
export class PaymentGatewayAdminController {
  constructor(private readonly payments: PaymentGatewayService) {}

  @Get()
  summary(@CurrentPrincipal() principal: Principal) {
    return this.payments.adminSummary(principal);
  }

  @Post('refunds')
  refund(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: RefundGatewayPaymentDto,
  ) {
    return this.payments.requestRefund(principal, dto);
  }
}
