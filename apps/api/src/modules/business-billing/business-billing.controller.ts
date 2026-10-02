import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { Principal } from '../../platform/auth/auth.types.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { RequirePermission } from '../../platform/permissions/require-permission.decorator.js';
import { BusinessBillingService } from './business-billing.service.js';
import {
  BillingListQueryDto,
  CreateCreditNoteDto,
  CreateInvoiceDto,
  CreatePaymentDto,
  CreateQuoteDto,
  CreateTaxRateDto,
  QuoteDecisionDto,
  UpdateInvoiceDto,
  UpdateQuoteDto,
  UpsertBillingSettingsDto,
} from './dto/business-billing.dto.js';

@Controller('business-billing')
export class BusinessBillingController {
  constructor(private readonly billing: BusinessBillingService) {}

  @Get('dashboard')
  @RequirePermission('business_billing.read')
  dashboard(@CurrentPrincipal() principal: Principal, @Query('workspaceId') workspaceId?: string) {
    return this.billing.dashboard(principal, workspaceId);
  }

  @Get('settings')
  @RequirePermission('business_billing.read')
  settings(@CurrentPrincipal() principal: Principal, @Query('workspaceId') workspaceId?: string) {
    return this.billing.getSettings(principal, workspaceId);
  }

  @Put('settings')
  @RequirePermission('business_billing.manage')
  upsertSettings(@CurrentPrincipal() principal: Principal, @Body() dto: UpsertBillingSettingsDto) {
    return this.billing.upsertSettings(principal, dto);
  }

  @Get('tax-rates')
  @RequirePermission('business_billing.read')
  taxRates(@CurrentPrincipal() principal: Principal, @Query('workspaceId') workspaceId?: string) {
    return this.billing.listTaxRates(principal, workspaceId);
  }

  @Post('tax-rates')
  @RequirePermission('business_billing.manage')
  createTaxRate(@CurrentPrincipal() principal: Principal, @Body() dto: CreateTaxRateDto) {
    return this.billing.createTaxRate(principal, dto);
  }

  @Get('quotes')
  @RequirePermission('business_billing.read')
  quotes(@CurrentPrincipal() principal: Principal, @Query() query: BillingListQueryDto) {
    return this.billing.listQuotes(principal, query);
  }

  @Get('quotes/:id')
  @RequirePermission('business_billing.read')
  quote(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.getQuote(principal, id);
  }

  @Post('quotes')
  @RequirePermission('business_billing.manage')
  createQuote(@CurrentPrincipal() principal: Principal, @Body() dto: CreateQuoteDto) {
    return this.billing.createQuote(principal, dto);
  }

  @Patch('quotes/:id')
  @RequirePermission('business_billing.manage')
  updateQuote(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuoteDto,
  ) {
    return this.billing.updateQuote(principal, id, dto);
  }

  @Post('quotes/:id/issue')
  @RequirePermission('business_billing.manage')
  issueQuote(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.issueQuote(principal, id);
  }

  @Post('quotes/:id/decision')
  @RequirePermission('business_billing.manage')
  decideQuote(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QuoteDecisionDto,
  ) {
    return this.billing.decideQuote(principal, id, dto);
  }

  @Get('invoices')
  @RequirePermission('business_billing.read')
  invoices(@CurrentPrincipal() principal: Principal, @Query() query: BillingListQueryDto) {
    return this.billing.listInvoices(principal, query);
  }

  @Get('invoices/:id')
  @RequirePermission('business_billing.read')
  invoice(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.getInvoice(principal, id);
  }

  @Post('invoices')
  @RequirePermission('business_billing.manage')
  createInvoice(@CurrentPrincipal() principal: Principal, @Body() dto: CreateInvoiceDto) {
    return this.billing.createInvoice(principal, dto);
  }

  @Patch('invoices/:id')
  @RequirePermission('business_billing.manage')
  updateInvoice(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.billing.updateInvoice(principal, id, dto);
  }

  @Post('invoices/:id/issue')
  @RequirePermission('business_billing.manage')
  issueInvoice(@CurrentPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.issueInvoice(principal, id);
  }

  @Post('invoices/:id/payments')
  @RequirePermission('business_billing.payment.manage')
  recordPayment(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.billing.recordPayment(principal, id, dto);
  }

  @Post('invoices/:id/credit-notes')
  @RequirePermission('business_billing.credit_note.manage')
  creditNote(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCreditNoteDto,
  ) {
    return this.billing.issueCreditNote(principal, id, dto);
  }
}
