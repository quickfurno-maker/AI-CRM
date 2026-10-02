import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
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

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

export class AttendanceListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 100;
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @IsOptional() @IsString() @MaxLength(64) status?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class CreateDepartmentDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() managerMemberId?: string;
  @IsString() @MinLength(1) @MaxLength(180) name: string;
  @IsOptional() @IsString() @MaxLength(64) code?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateEmployeeDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() organizationMemberId?: string;
  @IsOptional() @IsUUID() managerMemberId?: string;
  @IsString() @MinLength(1) @MaxLength(64) employeeCode: string;
  @IsString() @MinLength(1) @MaxLength(180) displayName: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) designation?: string;
  @IsOptional()
  @IsIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT'])
  employmentType?: string;
  @IsOptional() @IsDateString() joiningDate?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() managerMemberId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(180) displayName?: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) designation?: string;
  @IsOptional()
  @IsIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT'])
  employmentType?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'EXITED']) status?: string;
  @IsOptional() @IsDateString() exitDate?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateShiftDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsString() @MinLength(1) @MaxLength(160) name: string;
  @IsString() @MinLength(1) @MaxLength(64) code: string;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @Matches(TIME_PATTERN) startTime: string;
  @Matches(TIME_PATTERN) endTime: string;
  @IsOptional() @IsInt() @Min(0) @Max(480) breakMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(240) graceMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1440) expectedMinutes?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weeklyOffDays?: number[];
}

export class AssignShiftDto {
  @IsUUID() employeeId: string;
  @IsUUID() shiftId: string;
  @IsDateString() effectiveFrom: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class CreateAttendancePolicyDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsString() @MinLength(1) @MaxLength(180) name: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional()
  @IsIn(['NONE', 'OPTIONAL', 'REQUIRED'])
  locationValidationMode?: string;
  @IsOptional() @IsNumberString() latitude?: string;
  @IsOptional() @IsNumberString() longitude?: string;
  @IsOptional() @IsInt() @Min(10) @Max(100000) radiusMeters?: number;
  @IsOptional() @IsInt() @Min(10) @Max(5000) maxAccuracyMeters?: number;
  @IsOptional() @IsBoolean() allowRemote?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(240) lateGraceMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(240) earlyExitGraceMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(36) maxShiftHours?: number;
}

export class UpdateAttendancePolicyDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(180) name?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional()
  @IsIn(['NONE', 'OPTIONAL', 'REQUIRED'])
  locationValidationMode?: string;
  @IsOptional() @IsNumberString() latitude?: string;
  @IsOptional() @IsNumberString() longitude?: string;
  @IsOptional() @IsInt() @Min(10) @Max(100000) radiusMeters?: number;
  @IsOptional() @IsInt() @Min(10) @Max(5000) maxAccuracyMeters?: number;
  @IsOptional() @IsBoolean() allowRemote?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(240) lateGraceMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(240) earlyExitGraceMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(36) maxShiftHours?: number;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
}

export class CreateHolidayDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsDateString() holidayDate: string;
  @IsString() @MinLength(1) @MaxLength(180) name: string;
  @IsOptional() @IsIn(['PUBLIC', 'OPTIONAL', 'COMPANY']) holidayType?: string;
  @IsOptional() @IsBoolean() isPaid?: boolean;
}

export class PunchDto {
  @IsOptional() @IsNumberString() latitude?: string;
  @IsOptional() @IsNumberString() longitude?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) accuracyMeters?: number;
  @IsOptional() @IsString() @MaxLength(160) idempotencyKey?: string;
  @IsOptional() @IsIn(['WEB', 'MOBILE']) source?: string;
}

export class AdminPunchDto extends PunchDto {
  @IsOptional() @IsDateString() occurredAt?: string;
}

export class CreateLeaveRequestDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsString() @MinLength(1) @MaxLength(64) leaveType: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsOptional() @Matches(/^\d+(?:\.\d{1,2})?$/) requestedDays?: string;
  @IsOptional() @IsString() @MaxLength(4000) reason?: string;
}

export class DecideLeaveDto {
  @IsIn(['APPROVED', 'REJECTED']) status: string;
  @IsOptional() @IsString() @MaxLength(4000) decisionNotes?: string;
}

export class ReconcileAttendanceDto {
  @IsDateString() date: string;
  @IsOptional() @IsUUID() branchId?: string;
}

export class AttendanceReportQueryDto {
  @IsDateString() from: string;
  @IsDateString() to: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
}
