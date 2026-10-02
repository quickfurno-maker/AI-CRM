import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class BillingListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsString() @MaxLength(32) status?: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() dealId?: string;
}

export class UpsertBillingSettingsDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsString() @MinLength(1) @MaxLength(240) legalName: string;
  @IsOptional() @IsString() @MaxLength(120) taxId?: string;
  @IsOptional() @IsEmail() @MaxLength(320) billingEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) billingPhone?: string;
  @IsOptional() @IsString() @MaxLength(240) addressLine1?: string;
  @IsOptional() @IsString() @MaxLength(240) addressLine2?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(32) postalCode?: string;
  @IsOptional() @Matches(/^[A-Z]{2}$/) country?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsString() @MaxLength(24) quotePrefix?: string;
  @IsOptional() @IsString() @MaxLength(24) invoicePrefix?: string;
  @IsOptional() @IsString() @MaxLength(24) creditNotePrefix?: string;
  @IsOptional() @IsString() @MaxLength(24) receiptPrefix?: string;
  @IsOptional() @IsInt() @Min(0) @Max(365) defaultPaymentTermsDays?: number;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

export class CreateTaxRateDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @Matches(/^\d+(?:\.\d{1,4})?$/) ratePercent: string;
  @IsOptional() @IsString() @MaxLength(80) taxCode?: string;
}

export class DocumentItemDto {
  @IsString() @MinLength(1) @MaxLength(4000) description: string;
  @Matches(/^\d+(?:\.\d{1,3})?$/) quantity: string;
  @Matches(/^\d+(?:\.\d{1,2})?$/) unitPrice: string;
  @IsOptional() @Matches(/^\d+(?:\.\d{1,2})?$/) discountAmount?: string;
  @IsOptional() @Matches(/^\d+(?:\.\d{1,4})?$/) taxRatePercent?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateQuoteDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string;
  @IsArray() @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DocumentItemDto)
  items: DocumentItemDto[];
}

export class UpdateQuoteDto {
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DocumentItemDto)
  items?: DocumentItemDto[];
}

export class QuoteDecisionDto {
  @IsIn(['ACCEPTED', 'REJECTED'])
  status: string;
}

export class CreateInvoiceDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() quoteId?: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DocumentItemDto)
  items?: DocumentItemDto[];
}

export class UpdateInvoiceDto {
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DocumentItemDto)
  items?: DocumentItemDto[];
}

export class CreatePaymentDto {
  @Matches(/^\d+(?:\.\d{1,2})?$/) amount: string;
  @IsIn(['CASH', 'BANK_TRANSFER', 'CARD', 'UPI', 'CHEQUE', 'OTHER'])
  method: string;
  @IsOptional() @IsString() @MaxLength(180) reference?: string;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

export class CreateCreditNoteDto {
  @Matches(/^\d+(?:\.\d{1,2})?$/) amount: string;
  @IsString() @MinLength(2) @MaxLength(4000) reason: string;
}

export class AnalyticsRangeQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() workspaceId?: string;
}
