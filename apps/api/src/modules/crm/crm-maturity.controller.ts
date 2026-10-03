import {
  Body,
  Controller,
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
import { CrmMaturityService } from './crm-maturity.service.js';
import { CrmSettingsService } from './crm-settings.service.js';
import {
  CreateCrmExportJobDto,
  CreateCrmImportJobDto,
  CreateLeadScoringRuleDto,
  SetSavedListMembersDto,
  UpdateCustomFieldDto,
  UpdateLeadScoringRuleDto,
  UpdateSavedListDto,
} from './dto/crm.dto.js';

@Controller('crm')
export class CrmMaturityController {
  constructor(
    private readonly maturity: CrmMaturityService,
    private readonly settings: CrmSettingsService,
  ) {}

  @Patch('custom-fields/:id')
  @RequirePermission('crm.custom_field.manage')
  updateCustomField(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomFieldDto,
  ) {
    return this.settings.updateCustomField(principal, id, dto);
  }

  @Patch('lists/:id')
  @RequirePermission('crm.list.manage')
  updateList(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSavedListDto,
  ) {
    return this.settings.updateSavedList(principal, id, dto);
  }

  @Get('lists/:id/members')
  @RequirePermission('crm.list.manage')
  listMembers(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.settings.listSavedListMembers(principal, id);
  }

  @Put('lists/:id/members')
  @RequirePermission('crm.list.manage')
  setMembers(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetSavedListMembersDto,
  ) {
    return this.settings.setSavedListMembers(principal, id, dto);
  }

  @Get('lists/:id/evaluate')
  @RequirePermission('crm.list.manage')
  evaluateList(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number(limit ?? 100);
    return this.maturity.evaluateSavedList(
      principal,
      id,
      Number.isFinite(parsed) ? parsed : 100,
    );
  }

  @Get('scoring-rules')
  @RequirePermission('crm.scoring.manage')
  scoringRules(
    @CurrentPrincipal() principal: Principal,
    @Query('workspaceId') workspaceId?: string,
  ) {
    return this.maturity.listScoringRules(principal, workspaceId);
  }

  @Post('scoring-rules')
  @RequirePermission('crm.scoring.manage')
  createScoringRule(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateLeadScoringRuleDto,
  ) {
    return this.maturity.createScoringRule(principal, dto);
  }

  @Patch('scoring-rules/:id')
  @RequirePermission('crm.scoring.manage')
  updateScoringRule(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadScoringRuleDto,
  ) {
    return this.maturity.updateScoringRule(principal, id, dto);
  }

  @Post('leads/:id/recalculate-score')
  @RequirePermission('crm.lead.update')
  recalculateScore(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.maturity.recalculateLeadScore(principal, id);
  }

  @Get('data-jobs')
  @RequirePermission('crm.data.manage')
  dataJobs(@CurrentPrincipal() principal: Principal) {
    return this.maturity.listDataJobs(principal);
  }

  @Post('data-jobs/import')
  @RequirePermission('crm.data.manage')
  createImport(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateCrmImportJobDto,
  ) {
    return this.maturity.createImportJob(principal, dto);
  }

  @Post('data-jobs/export')
  @RequirePermission('crm.data.manage')
  createExport(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateCrmExportJobDto,
  ) {
    return this.maturity.createExportJob(principal, dto);
  }

  @Get('data-jobs/:id')
  @RequirePermission('crm.data.manage')
  dataJob(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.maturity.getDataJob(principal, id);
  }

  @Get('data-jobs/:id/rows')
  @RequirePermission('crm.data.manage')
  dataJobRows(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number(limit ?? 5000);
    return this.maturity.getDataJobRows(
      principal,
      id,
      Number.isFinite(parsed) ? parsed : 5000,
    );
  }
}
