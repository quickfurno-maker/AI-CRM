import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class BeginEmbeddedSignupDto {
  @IsOptional() @IsUUID() workspaceId?: string;
}

export class CompleteEmbeddedSignupDto {
  @IsUUID() connectionId: string;
  @IsString() @MinLength(1) @MaxLength(180) signupState: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(4096) authorizationCode?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(4096) accessToken?: string;
  @IsString() @MinLength(1) @MaxLength(180) wabaId: string;
  @IsString() @MinLength(1) @MaxLength(180) phoneNumberId: string;
  @IsOptional() @IsString() @MaxLength(180) businessPortfolioId?: string;
  @IsOptional() @IsString() @MaxLength(120) displayAddress?: string;
  @IsOptional() @IsString() @MaxLength(160) displayName?: string;
  @IsOptional() @IsString() @MaxLength(6) pin?: string;
}

export class RegisterMetaPhoneDto {
  @IsString() @MinLength(6) @MaxLength(6) pin: string;
}

export class CreateChannelAccountDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsString() @MinLength(1) @MaxLength(180) providerAccountId: string;
  @IsString() @MinLength(1) @MaxLength(180) providerPhoneNumberId: string;
  @IsOptional() @IsString() @MaxLength(160) displayName?: string;
  @IsOptional() @IsString() @MaxLength(120) displayAddress?: string;
  @IsString() @MinLength(5) @MaxLength(500) credentialRef: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UpdateConversationDto {
  @IsOptional() @IsUUID() assignedMemberId?: string;
  @IsOptional() @IsIn(['OPEN', 'CLOSED']) status?: string;
  @IsOptional() @IsIn(['HUMAN', 'AI', 'AI_ASSIST']) handlingMode?: string;
}

export class SendTextMessageDto {
  @IsString() @MinLength(1) @MaxLength(4096) text: string;
  @IsOptional() @IsString() @MaxLength(180) idempotencyKey?: string;
}

export class CreateTemplateDto {
  @IsUUID() channelAccountId: string;
  @IsString() @MinLength(1) @MaxLength(512) name: string;
  @IsString() @MinLength(2) @MaxLength(32) language: string;
  @IsOptional() @IsIn(['MARKETING', 'UTILITY', 'AUTHENTICATION']) category?: string;
  @IsArray() components: unknown[];
}

export class SendTemplateMessageDto {
  @IsUUID() templateId: string;
  @IsOptional() @IsArray() components?: unknown[];
  @IsOptional() @IsString() @MaxLength(180) idempotencyKey?: string;
}

export class SetConsentDto {
  @IsIn(['SERVICE', 'MARKETING']) purpose: string;
  @IsIn(['GRANTED', 'REVOKED']) status: string;
  @IsString() @MinLength(1) @MaxLength(100) source: string;
  @IsOptional() @IsObject() proof?: Record<string, unknown>;
}

export class CreateCampaignDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsUUID() channelAccountId: string;
  @IsUUID() templateId: string;
  @IsString() @MinLength(1) @MaxLength(220) name: string;
  @IsOptional() @IsObject() audienceFilters?: Record<string, unknown>;
  @IsOptional() @IsDateString() scheduledAt?: string;
}

export class MarkReadDto {
  @IsOptional() @IsString() @MaxLength(220) externalMessageId?: string;
  @IsOptional() @IsBoolean() typing?: boolean;
}
