import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PlatformSearchQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  q: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(40)
  limit?: number;
}

export class CreateSupportTicketDto {
  @IsString()
  @IsIn(['PRODUCT', 'BILLING', 'WHATSAPP', 'AI', 'AUTOMATION', 'SECURITY', 'OTHER'])
  category: string;

  @IsOptional()
  @IsString()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: string;

  @IsString()
  @MinLength(4)
  @MaxLength(240)
  subject: string;

  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  relatedResourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  relatedResourceId?: string;
}

export class AddSupportCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  body: string;
}

export class UpdateSupportTicketDto {
  @IsOptional()
  @IsString()
  @IsIn(['OPEN', 'WAITING_CUSTOMER', 'WAITING_PROVIDER', 'RESOLVED', 'CLOSED'])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: string;
}

export class ProviderUpdateSupportTicketDto extends UpdateSupportTicketDto {
  @IsOptional()
  @IsUUID()
  assignedProviderUserId?: string;
}

export class UpsertGovernancePolicyDto {
  @IsInt()
  @Min(30)
  @Max(3650)
  auditRetentionDays: number;

  @IsInt()
  @Min(30)
  @Max(3650)
  notificationRetentionDays: number;

  @IsInt()
  @Min(90)
  @Max(3650)
  supportRetentionDays: number;

  @IsInt()
  @Min(30)
  @Max(3650)
  aiTraceRetentionDays: number;

  @IsInt()
  @Min(7)
  @Max(180)
  deletionGraceDays: number;

  @IsBoolean()
  legalHold: boolean;
}

export class CreateGovernanceRequestDto {
  @IsString()
  @IsIn(['EXPORT', 'ERASURE'])
  requestType: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class ReviewGovernanceRequestDto {
  @IsString()
  @IsIn(['APPROVE', 'REJECT'])
  decision: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
