import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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

export const ACCESS_CLASSES = [
  'FULL',
  'LIGHT',
  'ATTENDANCE_ONLY',
  'GUEST',
] as const;

export class CreateInvitationDto {
  @IsEmail() @MaxLength(320) email: string;
  @IsIn(ACCESS_CLASSES)
  seatClass: (typeof ACCESS_CLASSES)[number];
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() staffProfileId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('4', { each: true })
  roleIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('4', { each: true })
  teamIds?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(168) expiresInHours?: number;
}

export class AcceptInvitationDto {
  @IsString() @MinLength(24) @MaxLength(512) token: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) displayName?: string;
  @IsOptional() @IsString() @MinLength(12) @MaxLength(200) password?: string;
}

export class CreateTeamDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsString() @MinLength(1) @MaxLength(160) name: string;
}

export class SetTeamMembersDto {
  @IsArray() @ArrayMaxSize(500) @IsUUID('4', { each: true })
  memberIds: string[];
}

export class RolePermissionDto {
  @IsString() @MinLength(1) @MaxLength(160) key: string;
  @IsIn(['OWN', 'TEAM', 'BRANCH', 'WORKSPACE', 'ORGANIZATION'])
  scope: 'OWN' | 'TEAM' | 'BRANCH' | 'WORKSPACE' | 'ORGANIZATION';
}

export class CreateRoleDto {
  @IsString() @Matches(/^[a-z][a-z0-9_-]*$/) @MaxLength(100) key: string;
  @IsString() @MinLength(1) @MaxLength(160) name: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsArray() @ArrayMaxSize(250)
  @ValidateNested({ each: true })
  @Type(() => RolePermissionDto)
  permissions: RolePermissionDto[];
}

export class SetRolePermissionsDto {
  @IsArray() @ArrayMaxSize(250)
  @ValidateNested({ each: true })
  @Type(() => RolePermissionDto)
  permissions: RolePermissionDto[];
}

export class SetMemberRolesDto {
  @IsArray() @ArrayMaxSize(30) @IsUUID('4', { each: true })
  roleIds: string[];
}

export class UpdateMemberStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status: 'ACTIVE' | 'SUSPENDED';
}

export class TeamAdminMetadataDto {
  @IsOptional() @IsObject()
  metadata?: Record<string, unknown>;
}
