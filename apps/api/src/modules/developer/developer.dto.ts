import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateApiKeyDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) scopes: string[];
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class CreateOauthClientDto {
  @IsString() @MinLength(2) @MaxLength(160) name: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) scopes: string[];
}

export class OauthClientCredentialsDto {
  @IsString() @MinLength(8) @MaxLength(120) clientId: string;
  @IsString() @MinLength(20) @MaxLength(300) clientSecret: string;
  @IsOptional() @IsString() @MaxLength(2000) scope?: string;
}

export class CreateWebhookEndpointDto {
  @IsString() @MinLength(2) @MaxLength(160) name: string;
  @IsUrl({ require_protocol: true }) @MaxLength(2000) url: string;
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) events: string[];
}

export class UpdateWebhookEndpointDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(2000) url?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) events?: string[];
  @IsOptional() @IsIn(['ACTIVE', 'PAUSED']) status?: string;
}

export class DeveloperListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 100;
}

export class InstallMarketplaceExtensionDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) scopes?: string[];
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class PublishMarketplaceExtensionDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{2,119}$/)
  key: string;

  @IsString() @MinLength(2) @MaxLength(180) name: string;
  @IsString() @Matches(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/) version: string;
  @IsString() @MinLength(2) @MaxLength(180) publisher: string;
  @IsString() @MinLength(10) @MaxLength(5000) description: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) requiredScopes: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) eventSubscriptions?: string[];
  @IsObject() manifest: Record<string, unknown>;
  @IsOptional() @IsBoolean() isFirstParty?: boolean;
}

export class SetMarketplaceExtensionStatusDto {
  @IsIn(['DRAFT', 'REVIEW', 'PUBLISHED', 'SUSPENDED'])
  status: string;
}
