import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { Principal } from '../../platform/auth/auth.types.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { RequirePermission } from '../../platform/permissions/require-permission.decorator.js';
import {
  AssignSeatDto,
  CreateStaffDto,
  StaffListQueryDto,
  UpdateStaffDto,
} from './staff.dto.js';
import { StaffService } from './staff.service.js';

@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequirePermission('staff.read')
  list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: StaffListQueryDto,
  ) {
    return this.staff.listStaff(principal, query);
  }

  @Post()
  @RequirePermission('staff.manage')
  create(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateStaffDto,
  ) {
    return this.staff.createStaff(principal, dto);
  }

  @Patch(':id')
  @RequirePermission('staff.manage')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staff.updateStaff(principal, id, dto);
  }

  @Get('members/directory')
  @RequirePermission('members.read')
  members(@CurrentPrincipal() principal: Principal) {
    return this.staff.listMembers(principal);
  }

  @Get('seats')
  @RequirePermission('seats.read')
  seats(@CurrentPrincipal() principal: Principal) {
    return this.staff.listSeats(principal);
  }

  @Get('seats/summary')
  @RequirePermission('seats.read')
  seatSummary(@CurrentPrincipal() principal: Principal) {
    return this.staff.seatSummary(principal);
  }

  @Put('members/:id/seat')
  @RequirePermission('seats.manage')
  assignSeat(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignSeatDto,
  ) {
    return this.staff.assignSeat(principal, id, dto);
  }

  @Delete('members/:id/seat')
  @RequirePermission('seats.manage')
  revokeSeat(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.staff.revokeSeat(principal, id);
  }
}
