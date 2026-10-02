import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Put,
} from '@nestjs/common';
import type { Principal } from '../../platform/auth/auth.types.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { RequirePermission } from '../../platform/permissions/require-permission.decorator.js';
import { AiKnowledgeService } from './ai-knowledge.service.js';
import { AiManagementService } from './ai-management.service.js';
import { AiRuntimeService } from './ai-runtime.service.js';
import { AiToolGatewayService } from './ai-tool-gateway.service.js';
import {
  CreateAgentDto,
  CreateAgentVersionDto,
  CreateEvaluationDto,
  CreateKnowledgeBaseDto,
  DecideApprovalDto,
  IngestKnowledgeTextDto,
  KnowledgeSearchDto,
  RunAgentDto,
  SetAgentToolPolicyDto,
  SimulateToolDto,
} from './dto/ai.dto.js';

@Controller('ai')
export class AiController {
  constructor(
    private readonly management: AiManagementService,
    private readonly runtime: AiRuntimeService,
    private readonly tools: AiToolGatewayService,
    private readonly knowledge: AiKnowledgeService,
  ) {}

  @Get('agents')
  @RequirePermission('ai.agent.read')
  listAgents(@CurrentPrincipal() principal: Principal) {
    return this.management.listAgents(principal);
  }

  @Post('agents')
  @RequirePermission('ai.agent.manage')
  createAgent(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateAgentDto,
  ) {
    return this.management.createAgent(principal, dto);
  }

  @Get('agents/:id/versions')
  @RequirePermission('ai.agent.read')
  listVersions(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.management.listVersions(principal, id);
  }

  @Post('agents/:id/versions')
  @RequirePermission('ai.agent.manage')
  createVersion(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAgentVersionDto,
  ) {
    return this.management.createVersion(principal, id, dto);
  }

  @Post('agents/:agentId/versions/:versionId/activate')
  @RequirePermission('ai.agent.manage')
  activateVersion(
    @CurrentPrincipal() principal: Principal,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.management.activateVersion(
      principal,
      agentId,
      versionId,
    );
  }
  @Get('tools')
  @RequirePermission('ai.agent.read')
  listTools() {
    return this.management.listAvailableTools();
  }

  @Get('agents/:agentId/versions/:versionId/tools')
  @RequirePermission('ai.agent.read')
  listToolPolicies(
    @CurrentPrincipal() principal: Principal,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.management.listToolPolicies(
      principal,
      agentId,
      versionId,
    );
  }

  @Put('agents/:agentId/versions/:versionId/tools')
  @RequirePermission('ai.tool.manage')
  setToolPolicy(
    @CurrentPrincipal() principal: Principal,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: SetAgentToolPolicyDto,
  ) {
    return this.management.setToolPolicy(
      principal,
      agentId,
      versionId,
      dto,
    );
  }

  @Post('agents/:id/run')
  @RequirePermission('ai.agent.run')
  runAgent(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RunAgentDto,
  ) {
    return this.runtime.runAgent(principal, id, dto);
  }

  @Get('runs')
  @RequirePermission('ai.agent.read')
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
  @RequirePermission('ai.agent.read')
  getRun(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.runtime.getRun(principal, id);
  }

  @Post('runs/:id/tools/:toolKey/simulate')
  @RequirePermission('ai.agent.run')
  simulateTool(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('toolKey') toolKey: string,
    @Body() dto: SimulateToolDto,
  ) {
    const allowed = [
      'get_contact',
      'search_knowledge',
      'create_task',
      'update_lead_qualification',
      'request_human_handoff',
    ] as const;
    if (!allowed.includes(toolKey as (typeof allowed)[number])) {
      throw new BadRequestException('Unknown AI tool key.');
    }
    return this.runtime.simulateTool(
      principal,
      id,
      toolKey as (typeof allowed)[number],
      dto.arguments,
    );
  }

  @Post('runs/:id/evaluations')
  @RequirePermission('ai.agent.manage')
  addEvaluation(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateEvaluationDto,
  ) {
    return this.runtime.addEvaluation(principal, id, dto);
  }
  @Get('approvals')
  @RequirePermission('ai.approval.read')
  listApprovals(@CurrentPrincipal() principal: Principal) {
    return this.tools.listApprovals(principal);
  }

  @Post('approvals/:id/decision')
  @RequirePermission('ai.approval.decide')
  decideApproval(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideApprovalDto,
  ) {
    return this.tools.decideApproval(
      principal,
      id,
      dto.status as 'APPROVED' | 'REJECTED',
      dto.reason,
    );
  }

  @Get('usage')
  @RequirePermission('ai.usage.read')
  usage(@CurrentPrincipal() principal: Principal) {
    return this.runtime.usageSummary(principal);
  }

  @Get('knowledge-bases')
  @RequirePermission('ai.knowledge.read')
  listKnowledgeBases(@CurrentPrincipal() principal: Principal) {
    return this.knowledge.listBases(principal);
  }

  @Post('knowledge-bases')
  @RequirePermission('ai.knowledge.manage')
  createKnowledgeBase(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateKnowledgeBaseDto,
  ) {
    return this.knowledge.createBase(principal, dto);
  }

  @Get('knowledge-bases/:id/documents')
  @RequirePermission('ai.knowledge.read')
  listDocuments(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.knowledge.listDocuments(principal, id);
  }

  @Post('knowledge-bases/:id/documents/text')
  @RequirePermission('ai.knowledge.manage')
  ingestText(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IngestKnowledgeTextDto,
  ) {
    return this.knowledge.ingestText(principal, id, dto);
  }

  @Post('knowledge-bases/:id/search')
  @RequirePermission('ai.knowledge.read')
  searchKnowledge(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: KnowledgeSearchDto,
  ) {
    return this.knowledge.search(
      principal,
      id,
      dto.query,
      dto.limit ?? 5,
    );
  }
}
