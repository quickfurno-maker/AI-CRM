import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const STAFF_ACCESS_CLASSES = [
  'FULL',
  'LIGHT',
  'ATTENDANCE_ONLY',
  'GUEST',
] as const;

export class StaffListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit = 200;
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() @MaxLength(64) status?: string;
  @IsOptional() @IsString() @MaxLength(160) search?: string;
}

export class CreateStaffDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() organizationMemberId?: string;
  @IsOptional() @IsUUID() managerMemberId?: string;
  @IsString() @MinLength(1) @MaxLength(64) employeeCode: string;
  @IsString() @MinLength(1) @MaxLength(180) displayName: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) designation?: string;
  @IsOptional() @IsString() @MaxLength(160) department?: string;
  @IsOptional()
  @IsIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT'])
  employmentType?: string;
  @IsOptional() @IsDateString() joiningDate?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UpdateStaffDto {
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() organizationMemberId?: string;
  @IsOptional() @IsUUID() managerMemberId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(180) displayName?: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) designation?: string;
  @IsOptional() @IsString() @MaxLength(160) department?: string;
  @IsOptional()
  @IsIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT'])
  employmentType?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'EXITED']) status?: string;
  @IsOptional() @IsDateString() exitDate?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class AssignSeatDto {
  @IsIn(STAFF_ACCESS_CLASSES)
  accessClass: (typeof STAFF_ACCESS_CLASSES)[number];

  @IsOptional() @IsObject()
  metadata?: Record<string, unknown>;
}
