import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpsertSaasBillingProfileDto {
  @IsString() @MinLength(1) @MaxLength(240) legalName: string;
  @IsEmail() @MaxLength(320) billingEmail: string;
  @IsOptional() @IsString() @MaxLength(40) billingPhone?: string;
  @IsOptional() @IsString() @MaxLength(120) taxId?: string;
  @IsOptional() @IsString() @MaxLength(240) addressLine1?: string;
  @IsOptional() @IsString() @MaxLength(240) addressLine2?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(32) postalCode?: string;
  @IsOptional() @Matches(/^[A-Z]{2}$/) country?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class ConfigurePlanPriceDto {
  @IsUUID() planId: string;
  @IsIn(['MONTHLY', 'YEARLY']) billingCycle: 'MONTHLY' | 'YEARLY';
  @Matches(/^[A-Z]{3}$/) currency: string;
  @Matches(/^\d+(?:\.\d{1,2})?$/) amount: string;
  @IsOptional() @IsIn(['DRAFT', 'ACTIVE', 'ARCHIVED']) status?: string;
  @IsOptional() @IsInt() @Min(0) @Max(365) trialDays?: number;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class ConfigurePlanDto {
  @IsString() @Matches(/^[a-z][a-z0-9-]*$/) @MaxLength(100) key: string;
  @IsString() @MinLength(1) @MaxLength(160) name: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ConfigureAddonDto {
  @IsString() @Matches(/^[a-z][a-z0-9._-]*$/) @MaxLength(120) key: string;
  @IsString() @MinLength(1) @MaxLength(180) name: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsString() @MinLength(1) @MaxLength(180) entitlementKey: string;
  @IsIn(['LIMIT_INCREMENT', 'ENABLE'])
  entitlementMode: 'LIMIT_INCREMENT' | 'ENABLE';
  @IsOptional() @IsInt() @Min(1) @Max(100000) unitsPerQuantity?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class ConfigureAddonPriceDto {
  @IsUUID() addonId: string;
  @IsIn(['MONTHLY', 'YEARLY']) billingCycle: 'MONTHLY' | 'YEARLY';
  @Matches(/^[A-Z]{3}$/) currency: string;
  @Matches(/^\d+(?:\.\d{1,2})?$/) amount: string;
  @IsOptional() @IsIn(['DRAFT', 'ACTIVE', 'ARCHIVED']) status?: string;
}

export class ConfigureCouponDto {
  @IsString() @Matches(/^[A-Z0-9_-]+$/) @MaxLength(80) code: string;
  @IsString() @MinLength(1) @MaxLength(180) name: string;
  @IsIn(['PERCENT', 'FIXED']) discountType: 'PERCENT' | 'FIXED';
  @Matches(/^\d+(?:\.\d{1,2})?$/) discountValue: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsIn(['ONCE', 'FOREVER', 'REPEATING']) duration?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000000) maxRedemptions?: number;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() expiresAt?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreatePlanCheckoutDto {
  @IsUUID() planPriceId: string;
  @IsOptional() @IsString() @MaxLength(80) couponCode?: string;
  @IsString() @MinLength(8) @MaxLength(180) idempotencyKey: string;
}

export class CreateAddonCheckoutDto {
  @IsUUID() addonPriceId: string;
  @IsInt() @Min(1) @Max(10000) quantity: number;
  @IsOptional() @IsString() @MaxLength(80) couponCode?: string;
  @IsString() @MinLength(8) @MaxLength(180) idempotencyKey: string;
}

export class CompleteCheckoutDto {
  @IsString() @MinLength(1) @MaxLength(40) provider: string;
  @IsString() @MinLength(1) @MaxLength(240) providerPaymentId: string;
  @IsOptional() @IsString() @MaxLength(240) providerSessionId?: string;
}

export class FailCheckoutDto {
  @IsString() @MinLength(1) @MaxLength(4000) reason: string;
  @IsOptional() @IsString() @MaxLength(240) providerAttemptId?: string;
}

export class RecordUsageDto {
  @IsUUID() organizationId: string;
  @IsString() @MinLength(1) @MaxLength(160) meterKey: string;
  @IsNumber() @Min(0) quantity: number;
  @IsOptional() @IsString() @MaxLength(40) unit?: string;
  @IsString() @MinLength(1) @MaxLength(64) sourceType: string;
  @IsOptional() @IsString() @MaxLength(180) sourceId?: string;
  @IsString() @MinLength(8) @MaxLength(240) idempotencyKey: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CancelSubscriptionDto {
  @IsOptional() @IsBoolean() immediately?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class ChangeAddonDto {
  @IsInt() @Min(0) @Max(10000) quantity: number;
}

export class CommercialDateRangeDto {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}
