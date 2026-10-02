import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Principal } from '../../platform/auth/auth.types.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { RequireEntitlement } from '../../platform/extensions/require-entitlement.decorator.js';
import { RequirePermission } from '../../platform/permissions/require-permission.decorator.js';
import {
  AdminPunchDto,
  AssignShiftDto,
  AttendanceListQueryDto,
  AttendanceReportQueryDto,
  CreateAttendancePolicyDto,
  CreateDepartmentDto,
  CreateEmployeeDto,
  CreateHolidayDto,
  CreateLeaveRequestDto,
  CreateShiftDto,
  DecideLeaveDto,
  PunchDto,
  ReconcileAttendanceDto,
  UpdateAttendancePolicyDto,
  UpdateEmployeeDto,
} from './dto/attendance.dto.js';
import { AttendanceService } from './attendance.service.js';

@Controller('attendance')
@RequireEntitlement('extension.attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('dashboard')
  @RequirePermission('attendance.record.read')
  dashboard(
    @CurrentPrincipal() principal: Principal,
    @Query() query: AttendanceListQueryDto,
  ) {
    return this.attendance.dashboard(principal, query.date);
  }

  @Get('departments')
  @RequirePermission('attendance.employee.read')
  departments(
    @CurrentPrincipal() principal: Principal,
    @Query() query: AttendanceListQueryDto,
  ) {
    return this.attendance.listDepartments(principal, query);
  }

  @Post('departments')
  @RequirePermission('attendance.department.manage')
  createDepartment(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.attendance.createDepartment(principal, dto);
  }

  @Get('employees')
  @RequirePermission('attendance.employee.read')
  employees(
    @CurrentPrincipal() principal: Principal,
    @Query() query: AttendanceListQueryDto,
  ) {
    return this.attendance.listEmployees(principal, query);
  }

  @Post('employees')
  @RequirePermission('attendance.employee.manage')
  createEmployee(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.attendance.createEmployee(principal, dto);
  }

  @Patch('employees/:id')
  @RequirePermission('attendance.employee.manage')
  updateEmployee(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.attendance.updateEmployee(principal, id, dto);
  }

  @Get('shifts')
  @RequirePermission('attendance.shift.read')
  shifts(
    @CurrentPrincipal() principal: Principal,
    @Query() query: AttendanceListQueryDto,
  ) {
    return this.attendance.listShifts(principal, query);
  }

  @Post('shifts')
  @RequirePermission('attendance.shift.manage')
  createShift(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateShiftDto,
  ) {
    return this.attendance.createShift(principal, dto);
  }

  @Post('shift-assignments')
  @RequirePermission('attendance.shift.manage')
  assignShift(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: AssignShiftDto,
  ) {
    return this.attendance.assignShift(principal, dto);
  }

  @Get('policies')
  @RequirePermission('attendance.policy.manage')
  policies(
    @CurrentPrincipal() principal: Principal,
    @Query() query: AttendanceListQueryDto,
  ) {
    return this.attendance.listPolicies(principal, query);
  }

  @Post('policies')
  @RequirePermission('attendance.policy.manage')
  createPolicy(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateAttendancePolicyDto,
  ) {
    return this.attendance.createPolicy(principal, dto);
  }

  @Patch('policies/:id')
  @RequirePermission('attendance.policy.manage')
  updatePolicy(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttendancePolicyDto,
  ) {
    return this.attendance.updatePolicy(principal, id, dto);
  }

  @Get('holidays')
  @RequirePermission('attendance.shift.read')
  holidays(
    @CurrentPrincipal() principal: Principal,
    @Query() query: AttendanceListQueryDto,
  ) {
    return this.attendance.listHolidays(principal, query);
  }

  @Post('holidays')
  @RequirePermission('attendance.shift.manage')
  createHoliday(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateHolidayDto,
  ) {
    return this.attendance.createHoliday(principal, dto);
  }

  @Post('me/check-in')
  @RequirePermission('attendance.self.punch')
  checkIn(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: PunchDto,
  ) {
    return this.attendance.punchSelf(principal, 'CHECK_IN', dto);
  }

  @Post('me/check-out')
  @RequirePermission('attendance.self.punch')
  checkOut(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: PunchDto,
  ) {
    return this.attendance.punchSelf(principal, 'CHECK_OUT', dto);
  }

  @Post('employees/:id/check-in')
  @RequirePermission('attendance.record.manage')
  adminCheckIn(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminPunchDto,
  ) {
    return this.attendance.punchEmployee(principal, id, 'CHECK_IN', dto);
  }

  @Post('employees/:id/check-out')
  @RequirePermission('attendance.record.manage')
  adminCheckOut(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminPunchDto,
  ) {
    return this.attendance.punchEmployee(principal, id, 'CHECK_OUT', dto);
  }

  @Get('records')
  @RequirePermission('attendance.record.read')
  records(
    @CurrentPrincipal() principal: Principal,
    @Query() query: AttendanceListQueryDto,
  ) {
    return this.attendance.listRecords(principal, query);
  }

  @Get('events')
  @RequirePermission('attendance.record.read')
  events(
    @CurrentPrincipal() principal: Principal,
    @Query() query: AttendanceListQueryDto,
  ) {
    return this.attendance.listEvents(principal, query);
  }

  @Get('leaves')
  @RequirePermission('attendance.leave.read')
  leaves(
    @CurrentPrincipal() principal: Principal,
    @Query() query: AttendanceListQueryDto,
  ) {
    return this.attendance.listLeaves(principal, query);
  }

  @Post('me/leaves')
  @RequirePermission('attendance.self.leave')
  createSelfLeave(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.attendance.createSelfLeave(principal, dto);
  }

  @Post('employees/:id/leaves')
  @RequirePermission('attendance.leave.manage')
  createEmployeeLeave(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.attendance.createEmployeeLeave(principal, id, dto);
  }

  @Patch('leaves/:id/decision')
  @RequirePermission('attendance.leave.approve')
  decideLeave(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideLeaveDto,
  ) {
    return this.attendance.decideLeave(principal, id, dto);
  }

  @Post('reconcile')
  @RequirePermission('attendance.record.manage')
  reconcile(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: ReconcileAttendanceDto,
  ) {
    return this.attendance.reconcileDay(principal, dto);
  }

  @Get('reports/summary')
  @RequirePermission('attendance.report.read')
  summaryReport(
    @CurrentPrincipal() principal: Principal,
    @Query() query: AttendanceReportQueryDto,
  ) {
    return this.attendance.summaryReport(principal, query);
  }
}
