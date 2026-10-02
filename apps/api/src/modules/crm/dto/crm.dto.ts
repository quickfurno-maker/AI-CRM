import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsDefined,
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
} from 'class-validator';

export class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class CreateContactDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() ownerMemberId?: string;
  @IsString() @MinLength(1) @MaxLength(240) displayName: string;
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(100) source?: string;
}

export class UpdateContactDto {
  @IsOptional() @IsUUID() ownerMemberId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) displayName?: string;
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(100) source?: string;
  @IsOptional() @IsIn(['LEAD', 'CUSTOMER', 'OTHER']) lifecycleStage?: string;
  @IsOptional() @IsIn(['ACTIVE', 'ARCHIVED']) status?: string;
}

export class LinkContactCompanyDto {
  @IsUUID() companyId: string;
  @IsOptional() @IsString() @MaxLength(100) relationship?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class CreateCompanyDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() ownerMemberId?: string;
  @IsString() @MinLength(1) @MaxLength(240) name: string;
  @IsOptional() @IsString() @MaxLength(255) domain?: string;
  @IsOptional() @IsString() @MaxLength(500) website?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) industry?: string;
}

export class UpdateCompanyDto {
  @IsOptional() @IsUUID() ownerMemberId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) name?: string;
  @IsOptional() @IsString() @MaxLength(255) domain?: string;
  @IsOptional() @IsString() @MaxLength(500) website?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) industry?: string;
  @IsOptional() @IsIn(['ACTIVE', 'ARCHIVED']) status?: string;
}

export class CreateLeadDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() ownerMemberId?: string;
  @IsString() @MinLength(1) @MaxLength(240) title: string;
  @IsOptional() @IsString() @MaxLength(100) source?: string;
  @IsOptional() @IsIn(['COLD', 'WARM', 'HOT', 'LOST']) temperature?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) score?: number;
  @IsOptional() @Matches(/^\d+(?:\.\d{1,2})?$/) estimatedValue?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsDateString() expectedCloseDate?: string;
}

export class UpdateLeadDto {
  @IsOptional() @IsUUID() ownerMemberId?: string;
  @IsOptional() @IsUUID() stageId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(100) source?: string;
  @IsOptional() @IsIn(['OPEN', 'QUALIFIED', 'UNQUALIFIED', 'LOST']) status?: string;
  @IsOptional() @IsIn(['COLD', 'WARM', 'HOT', 'LOST']) temperature?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) score?: number;
  @IsOptional() @Matches(/^\d+(?:\.\d{1,2})?$/) estimatedValue?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsDateString() expectedCloseDate?: string;
}

export class CreateDealDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsUUID() ownerMemberId?: string;
  @IsString() @MinLength(1) @MaxLength(240) name: string;
  @IsOptional() @Matches(/^\d+(?:\.\d{1,2})?$/) amount?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsDateString() expectedCloseDate?: string;
}

export class UpdateDealDto {
  @IsOptional() @IsUUID() ownerMemberId?: string;
  @IsOptional() @IsUUID() stageId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) name?: string;
  @IsOptional() @Matches(/^\d+(?:\.\d{1,2})?$/) amount?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsIn(['OPEN', 'WON', 'LOST']) status?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsDateString() expectedCloseDate?: string;
}

export class CreateTaskDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() ownerMemberId?: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsString() @MinLength(1) @MaxLength(240) title: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: string;
  @IsOptional() @IsDateString() dueAt?: string;
}

export class UpdateTaskDto {
  @IsOptional() @IsUUID() ownerMemberId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']) status?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: string;
  @IsOptional() @IsDateString() dueAt?: string;
}

export class CreateAppointmentDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() ownerMemberId?: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsString() @MinLength(1) @MaxLength(240) title: string;
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @IsString() @MaxLength(1000) location?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

export class UpdateAppointmentDto {
  @IsOptional() @IsUUID() ownerMemberId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) title?: string;
  @IsOptional() @IsIn(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']) status?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @IsString() @MaxLength(1000) location?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

export class CreateActivityDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsUUID() dealId?: string;
  @IsIn(['CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'STATUS_CHANGE', 'OTHER']) type: string;
  @IsOptional() @IsIn(['INBOUND', 'OUTBOUND', 'INTERNAL']) direction?: string;
  @IsOptional() @IsString() @MaxLength(240) subject?: string;
  @IsOptional() @IsString() @MaxLength(10000) body?: string;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateNoteDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsIn(['CONTACT', 'COMPANY', 'LEAD', 'DEAL']) objectType: string;
  @IsUUID() objectId: string;
  @IsString() @MinLength(1) @MaxLength(20000) body: string;
}

export class CreateTagDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(32) color?: string;
}

export class CreateCustomFieldDto {
  @IsIn(['CONTACT', 'COMPANY', 'LEAD', 'DEAL']) objectType: string;
  @IsString() @Matches(/^[a-z][a-z0-9_]*$/) @MaxLength(100) key: string;
  @IsString() @MinLength(1) @MaxLength(160) label: string;
  @IsIn(['TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT', 'MULTI_SELECT']) dataType: string;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsInt() @Min(0) position?: number;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class SetCustomFieldValueDto {
  @IsUUID() fieldId: string;
  @IsDefined() value: unknown;
}

export class CreateSavedListDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsIn(['CONTACT', 'COMPANY', 'LEAD', 'DEAL']) objectType: string;
  @IsString() @MinLength(1) @MaxLength(160) name: string;
  @IsOptional() @IsIn(['DYNAMIC', 'STATIC']) listType?: string;
  @IsOptional() @IsObject() filters?: Record<string, unknown>;
}
