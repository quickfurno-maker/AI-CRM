import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import type { Principal } from '../../platform/auth/auth.types.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { Public } from '../../platform/auth/public.decorator.js';
import { RequirePermission } from '../../platform/permissions/require-permission.decorator.js';
import {
  AcceptInvitationDto,
  CreateInvitationDto,
  CreateRoleDto,
  CreateTeamDto,
  SetMemberRolesDto,
  SetRolePermissionsDto,
  SetTeamMembersDto,
  UpdateMemberStatusDto,
} from './team-admin.dto.js';
import { TeamAdminService } from './team-admin.service.js';

@Controller('team-admin')
export class TeamAdminController {
  constructor(private readonly teamAdmin: TeamAdminService) {}

  @Get('members')
  @RequirePermission('members.read')
  members(@CurrentPrincipal() principal: Principal) {
    return this.teamAdmin.listMembers(principal);
  }

  @Get('invitations')
  @RequirePermission('members.read')
  invitations(@CurrentPrincipal() principal: Principal) {
    return this.teamAdmin.listInvitations(principal);
  }

  @Post('invitations')
  @RequirePermission('members.manage')
  invite(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.teamAdmin.createInvitation(principal, dto);
  }

  @Post('invitations/:id/resend')
  @RequirePermission('members.manage')
  resend(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.teamAdmin.rotateInvitation(principal, id);
  }

  @Post('invitations/:id/cancel')
  @RequirePermission('members.manage')
  cancel(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.teamAdmin.cancelInvitation(principal, id);
  }

  @Public()
  @Post('invitations/accept')
  accept(@Body() dto: AcceptInvitationDto) {
    return this.teamAdmin.acceptInvitation(dto);
  }

  @Get('roles')
  @RequirePermission('members.read')
  roles(@CurrentPrincipal() principal: Principal) {
    return this.teamAdmin.listRoles(principal);
  }

  @Post('roles')
  @RequirePermission('roles.manage')
  createRole(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateRoleDto,
  ) {
    return this.teamAdmin.createRole(principal, dto);
  }

  @Put('roles/:id/permissions')
  @RequirePermission('roles.manage')
  setRolePermissions(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRolePermissionsDto,
  ) {
    return this.teamAdmin.setRolePermissions(principal, id, dto);
  }

  @Put('members/:id/roles')
  @RequirePermission('roles.manage')
  setMemberRoles(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetMemberRolesDto,
  ) {
    return this.teamAdmin.setMemberRoles(principal, id, dto);
  }

  @Patch('members/:id/status')
  @RequirePermission('members.manage')
  updateMemberStatus(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMemberStatusDto,
  ) {
    return this.teamAdmin.updateMemberStatus(principal, id, dto);
  }

  @Get('teams')
  @RequirePermission('members.read')
  teams(@CurrentPrincipal() principal: Principal) {
    return this.teamAdmin.listTeams(principal);
  }

  @Post('teams')
  @RequirePermission('members.manage')
  createTeam(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateTeamDto,
  ) {
    return this.teamAdmin.createTeam(principal, dto);
  }

  @Put('teams/:id/members')
  @RequirePermission('members.manage')
  setTeamMembers(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTeamMembersDto,
  ) {
    return this.teamAdmin.setTeamMembers(principal, id, dto);
  }
}
