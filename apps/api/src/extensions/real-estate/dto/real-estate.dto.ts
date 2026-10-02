import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumberString,
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

export class RealEstateListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @IsOptional() @IsString() @MaxLength(64) status?: string;
  @IsOptional() @IsUUID() projectId?: string;
}

export class CreateDeveloperDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsString() @MinLength(1) @MaxLength(240) name: string;
  @IsOptional() @IsString() @MaxLength(100) code?: string;
  @IsOptional() @IsString() @MaxLength(160) reraRegistration?: string;
  @IsOptional() @IsString() @MaxLength(1000) website?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateProjectDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() developerId?: string;
  @IsString() @MinLength(1) @MaxLength(240) name: string;
  @IsOptional() @IsString() @MaxLength(100) code?: string;
  @IsString() @MinLength(1) @MaxLength(120) city: string;
  @IsString() @MinLength(1) @MaxLength(160) locality: string;
  @IsOptional() @IsString() @MaxLength(2000) address?: string;
  @IsOptional() @IsNumberString() latitude?: string;
  @IsOptional() @IsNumberString() longitude?: string;
  @IsOptional() @IsString() @MaxLength(160) reraNumber?: string;
  @IsOptional() @IsDateString() possessionDate?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) propertyTypes?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) amenities?: string[];
  @IsOptional() @Matches(/^\d+(?:\.\d{1,2})?$/) minPrice?: string;
  @IsOptional() @Matches(/^\d+(?:\.\d{1,2})?$/) maxPrice?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateBuildingDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsUUID() projectId: string;
  @IsString() @MinLength(1) @MaxLength(180) name: string;
  @IsOptional() @IsString() @MaxLength(100) code?: string;
  @IsOptional() @IsInt() @Min(0) @Max(300) floors?: number;
  @IsOptional() @IsDateString() possessionDate?: string;
}

export class CreatePropertyOwnerDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsUUID() contactId: string;
  @IsOptional() @IsIn(['INDIVIDUAL', 'COMPANY', 'DEVELOPER']) ownerType?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

export class CreateBrokerDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsUUID() contactId: string;
  @IsOptional() @IsString() @MaxLength(240) firmName?: string;
  @IsOptional() @IsString() @MaxLength(160) registrationNumber?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateUnitDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() buildingId?: string;
  @IsOptional() @IsUUID() propertyOwnerId?: string;
  @IsOptional() @IsString() @MaxLength(100) unitNumber?: string;
  @IsString() @MinLength(1) @MaxLength(240) title: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(160) locality?: string;
  @IsOptional() @IsString() @MaxLength(2000) address?: string;
  @IsOptional() @IsNumberString() latitude?: string;
  @IsOptional() @IsNumberString() longitude?: string;
  @IsIn(['APARTMENT', 'VILLA', 'PLOT', 'COMMERCIAL', 'OFFICE', 'SHOP', 'OTHER']) propertyType: string;
  @IsOptional() @IsString() @MaxLength(80) configuration?: string;
  @IsOptional() @IsInt() @Min(0) @Max(30) bedrooms?: number;
  @IsOptional() @IsInt() @Min(0) @Max(30) bathrooms?: number;
  @IsOptional() @IsNumberString() carpetArea?: string;
  @IsOptional() @IsNumberString() builtUpArea?: string;
  @IsOptional() @IsIn(['SQFT', 'SQM', 'SQYD', 'ACRE']) areaUnit?: string;
  @IsOptional() @IsInt() @Min(-10) @Max(300) floor?: number;
  @IsOptional() @IsString() @MaxLength(48) facing?: string;
  @IsOptional() @Matches(/^\d+(?:\.\d{1,2})?$/) price?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsIn(['AVAILABLE', 'HOLD', 'BOOKED', 'SOLD', 'UNAVAILABLE']) inventoryStatus?: string;
  @IsOptional() @IsString() @MaxLength(48) possessionStatus?: string;
  @IsOptional() @IsDateString() availableFrom?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) amenities?: string[];
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UpdateUnitDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(80) configuration?: string;
  @IsOptional() @IsNumberString() carpetArea?: string;
  @IsOptional() @IsNumberString() builtUpArea?: string;
  @IsOptional() @Matches(/^\d+(?:\.\d{1,2})?$/) price?: string;
  @IsOptional() @IsIn(['AVAILABLE', 'HOLD', 'BOOKED', 'SOLD', 'UNAVAILABLE']) inventoryStatus?: string;
  @IsOptional() @IsString() @MaxLength(48) possessionStatus?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) amenities?: string[];
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateRequirementDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsUUID() contactId: string;
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsUUID() ownerMemberId?: string;
  @IsOptional() @IsIn(['SELF_USE', 'INVESTMENT', 'RENTAL', 'OTHER']) purpose?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) cities?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) localities?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) propertyTypes?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) configurations?: string[];
  @IsOptional() @Matches(/^\d+(?:\.\d{1,2})?$/) minBudget?: string;
  @IsOptional() @Matches(/^\d+(?:\.\d{1,2})?$/) maxBudget?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsNumberString() minCarpetArea?: string;
  @IsOptional() @IsNumberString() maxCarpetArea?: string;
  @IsOptional() @IsString() @MaxLength(80) purchaseTimeline?: string;
  @IsOptional() @IsString() @MaxLength(80) possessionPreference?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) mustHaveAmenities?: string[];
  @IsOptional() @IsString() @MaxLength(10000) notes?: string;
}

export class UpdateRequirementDto {
  @IsOptional() @IsIn(['SELF_USE', 'INVESTMENT', 'RENTAL', 'OTHER']) purpose?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) cities?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) localities?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) propertyTypes?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) configurations?: string[];
  @IsOptional() @Matches(/^\d+(?:\.\d{1,2})?$/) minBudget?: string;
  @IsOptional() @Matches(/^\d+(?:\.\d{1,2})?$/) maxBudget?: string;
  @IsOptional() @IsNumberString() minCarpetArea?: string;
  @IsOptional() @IsNumberString() maxCarpetArea?: string;
  @IsOptional() @IsString() @MaxLength(80) purchaseTimeline?: string;
  @IsOptional() @IsString() @MaxLength(80) possessionPreference?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) mustHaveAmenities?: string[];
  @IsOptional() @IsIn(['ACTIVE', 'MATCHED', 'CLOSED', 'ARCHIVED']) status?: string;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string;
}

export class MatchRequirementDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 10;
}

export class CreateSiteVisitDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() requirementId?: string;
  @IsUUID() contactId: string;
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsUUID() ownerMemberId?: string;
  @IsDateString() scheduledAt: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

export class UpdateSiteVisitDto {
  @IsOptional() @IsIn(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']) status?: string;
  @IsOptional() @IsString() @MaxLength(48) outcome?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

export class CreateOfferDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() requirementId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsUUID() unitId: string;
  @Matches(/^\d+(?:\.\d{1,2})?$/) amount: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

export class CreateBookingDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsUUID() contactId: string;
  @IsOptional() @IsUUID() requirementId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsOptional() @IsUUID() offerId?: string;
  @IsUUID() unitId: string;
  @IsOptional() @IsUUID() brokerId?: string;
  @IsOptional() @Matches(/^\d+(?:\.\d{1,2})?$/) bookingAmount?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsString() @MaxLength(160) externalReference?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

export class UpdateBookingDto {
  @IsIn(['RESERVED', 'CONFIRMED', 'CANCELLED']) status: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

export class CreateCommissionDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsUUID() bookingId: string;
  @IsOptional() @IsUUID() brokerId?: string;
  @IsOptional() @IsIn(['FIXED', 'PERCENTAGE']) commissionType?: string;
  @IsOptional() @IsNumberString() rate?: string;
  @Matches(/^\d+(?:\.\d{1,2})?$/) amount: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsDateString() payableAt?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}
