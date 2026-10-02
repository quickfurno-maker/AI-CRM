import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { Principal } from '../../platform/auth/auth.types.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { RequirePermission } from '../../platform/permissions/require-permission.decorator.js';
import { AutomationManagementService } from './automation-management.service.js';
import { AutomationRuntimeService } from './automation-runtime.service.js';
import {
  CreateWorkflowDto,
  CreateWorkflowVersionDto,
  DecideAutomationApprovalDto,
  ProcessAutomationEventDto,
  SaveWorkflowGraphDto,
  TriggerWorkflowDto,
} from './dto/automation.dto.js';

@Controller('automation')
export class AutomationController {
  constructor(
    private readonly management: AutomationManagementService,
    private readonly runtime: AutomationRuntimeService,
  ) {}

  @Get('workflows')
  @RequirePermission('automation.workflow.read')
  listWorkflows(@CurrentPrincipal() principal: Principal) {
    return this.management.listWorkflows(principal);
  }

  @Post('workflows')
  @RequirePermission('automation.workflow.manage')
  createWorkflow(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateWorkflowDto,
  ) {
    return this.management.createWorkflow(principal, dto);
  }

  @Get('workflows/:id/versions')
  @RequirePermission('automation.workflow.read')
  listVersions(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.management.listVersions(principal, id);
  }

  @Post('workflows/:id/versions')
  @RequirePermission('automation.workflow.manage')
  createVersion(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateWorkflowVersionDto,
  ) {
    return this.management.createVersion(principal, id, dto);
  }

  @Get('workflows/:workflowId/versions/:versionId/graph')
  @RequirePermission('automation.workflow.read')
  getGraph(
    @CurrentPrincipal() principal: Principal,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.management.getGraph(principal, workflowId, versionId);
  }

  @Put('workflows/:workflowId/versions/:versionId/graph')
  @RequirePermission('automation.workflow.manage')
  saveGraph(
    @CurrentPrincipal() principal: Principal,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: SaveWorkflowGraphDto,
  ) {
    return this.management.saveGraph(
      principal,
      workflowId,
      versionId,
      dto,
    );
  }

  @Post('workflows/:workflowId/versions/:versionId/activate')
  @RequirePermission('automation.workflow.manage')
  activateVersion(
    @CurrentPrincipal() principal: Principal,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.management.activateVersion(
      principal,
      workflowId,
      versionId,
    );
  }

  @Post('workflows/:id/trigger')
  @RequirePermission('automation.run.trigger')
  triggerWorkflow(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TriggerWorkflowDto,
  ) {
    return this.runtime.startManual(
      principal,
      id,
      dto.context ?? {},
      dto.correlationId,
    );
  }

  @Get('runs')
  @RequirePermission('automation.workflow.read')
  listRuns(
    @CurrentPrincipal() principal: Principal,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number.parseInt(limit ?? '100', 10);
    return this.runtime.listRuns(
      principal,
      Number.isFinite(parsed) ? parsed : 100,
    );
  }

  @Get('runs/:id')
  @RequirePermission('automation.workflow.read')
  getRun(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.runtime.getRunDetail(principal, id);
  }

  @Post('runs/:id/resume')
  @RequirePermission('automation.run.manage')
  resumeRun(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.runtime.resumeDueRun(principal, id);
  }

  @Post('events/process')
  @RequirePermission('automation.run.manage')
  processEvent(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: ProcessAutomationEventDto,
  ) {
    return this.runtime.handleEvent({
      id: dto.eventId,
      eventType: dto.eventType,
      organizationId: principal.organizationId,
      aggregateType: dto.aggregateType,
      aggregateId: dto.aggregateId,
      payload: dto.payload ?? {},
      correlationId: dto.correlationId,
      causationId: dto.causationId,
      createdAt: new Date().toISOString(),
    });
  }

  @Get('approvals')
  @RequirePermission('automation.approval.read')
  listApprovals(@CurrentPrincipal() principal: Principal) {
    return this.runtime.listApprovals(principal);
  }

  @Post('approvals/:id/decision')
  @RequirePermission('automation.approval.decide')
  decideApproval(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideAutomationApprovalDto,
  ) {
    return this.runtime.decideApproval(
      principal,
      id,
      dto.status as 'APPROVED' | 'REJECTED',
      dto.reason,
    );
  }
}
