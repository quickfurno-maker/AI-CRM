import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateEnterpriseSecurityPolicyDto {
  @IsOptional() @IsBoolean() enforceIpAllowlist?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) ipAllowlist?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) allowedEmailDomains?: string[];
  @IsOptional() @IsInt() @Min(15) @Max(525600) sessionMaxMinutes?: number;
  @IsOptional() @IsInt() @Min(30) @Max(3650) auditRetentionDays?: number;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class CreateIdentityConnectionDto {
  @IsString() @MinLength(2) @MaxLength(160) name: string;
  @IsOptional() @IsIn(['OIDC']) providerType?: string;
  @IsUrl({ require_protocol: true }) @MaxLength(2000) issuerUrl: string;
  @IsString() @MinLength(3) @MaxLength(240) clientId: string;
  @IsString() @MinLength(8) @MaxLength(2000) clientSecret: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) domains?: string[];
}

export class CreateScimTokenDto {
  @IsString() @MinLength(2) @MaxLength(160) name: string;
  @IsOptional() @IsString() expiresAt?: string;
}

export class StartOidcLoginQueryDto {
  @IsOptional() @IsString() @MaxLength(500) returnTo?: string;
}

export class OidcCallbackQueryDto {
  @IsOptional() @IsString() @MaxLength(400) state?: string;
  @IsOptional() @IsString() @MaxLength(4000) code?: string;
  @IsOptional() @IsString() @MaxLength(200) error?: string;
  @IsOptional() @IsString() @MaxLength(1000) error_description?: string;
}

export class ExchangeOidcLoginDto {
  @IsString() @MinLength(20) @MaxLength(400) code: string;
}

export class ScimCreateUserDto {
  @IsString() @IsEmail() userName: string;
  @IsOptional() @IsString() @MaxLength(160) displayName?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional()
  name?: {
    formatted?: string;
    givenName?: string;
    familyName?: string;
  };
  @IsOptional() @IsArray() emails?: Array<{ value: string; primary?: boolean }>;
}

export class ScimPatchOperationDto {
  @IsString() @IsIn(['replace', 'Replace', 'REPLACE']) op: string;
  @IsOptional() @IsString() @MaxLength(120) path?: string;
  value: unknown;
}

export class ScimPatchUserDto {
  @IsArray() @ArrayMaxSize(20) Operations: ScimPatchOperationDto[];
}
