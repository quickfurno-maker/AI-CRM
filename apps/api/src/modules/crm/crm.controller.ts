import {
  BadRequestException,
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
import { ContactsService } from './contacts.service.js';
import { CrmSettingsService } from './crm-settings.service.js';
import { EngagementService } from './engagement.service.js';
import { SalesService } from './sales.service.js';
import {
  CreateActivityDto,
  CreateAppointmentDto,
  CreateCompanyDto,
  CreateContactDto,
  CreateCustomFieldDto,
  CreateDealDto,
  CreateLeadDto,
  CreateNoteDto,
  CreateSavedListDto,
  CreateTagDto,
  CreateTaskDto,
  LinkContactCompanyDto,
  ListQueryDto,
  SetCustomFieldValueDto,
  UpdateAppointmentDto,
  UpdateCompanyDto,
  UpdateContactDto,
  UpdateDealDto,
  UpdateLeadDto,
  UpdateTaskDto,
} from './dto/crm.dto.js';

@Controller('crm')
export class CrmController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly sales: SalesService,
    private readonly engagement: EngagementService,
    private readonly settings: CrmSettingsService,
  ) {}

  @Get('contacts')
  @RequirePermission('crm.contact.read')
  listContacts(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListQueryDto,
  ) {
    return this.contacts.listContacts(principal, query);
  }

  @Post('contacts')
  @RequirePermission('crm.contact.create')
  createContact(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateContactDto,
  ) {
    return this.contacts.createContact(principal, dto);
  }

  @Get('contacts/:id')
  @RequirePermission('crm.contact.read')
  getContact(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contacts.getContact(principal, id);
  }

  @Patch('contacts/:id')
  @RequirePermission('crm.contact.update')
  updateContact(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contacts.updateContact(principal, id, dto);
  }

  @Get('contacts/:id/companies')
  @RequirePermission('crm.contact.read')
  listContactCompanies(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contacts.listContactCompanies(principal, id);
  }

  @Post('contacts/:id/companies')
  @RequirePermission('crm.contact.update')
  linkContactCompany(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkContactCompanyDto,
  ) {
    return this.contacts.linkContactCompany(principal, id, dto);
  }

  @Get('companies')
  @RequirePermission('crm.company.read')
  listCompanies(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListQueryDto,
  ) {
    return this.contacts.listCompanies(principal, query);
  }

  @Post('companies')
  @RequirePermission('crm.company.create')
  createCompany(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateCompanyDto,
  ) {
    return this.contacts.createCompany(principal, dto);
  }

  @Get('companies/:id')
  @RequirePermission('crm.company.read')
  getCompany(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contacts.getCompany(principal, id);
  }

  @Patch('companies/:id')
  @RequirePermission('crm.company.update')
  updateCompany(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.contacts.updateCompany(principal, id, dto);
  }

  @Get('pipelines')
  @RequirePermission('crm.pipeline.read')
  pipelines(
    @CurrentPrincipal() principal: Principal,
    @Query('objectType') objectType: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    if (objectType !== 'LEAD' && objectType !== 'DEAL') {
      throw new BadRequestException('objectType must be LEAD or DEAL.');
    }
    return this.sales.pipelines(principal, objectType, workspaceId);
  }

  @Get('leads')
  @RequirePermission('crm.lead.read')
  listLeads(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListQueryDto,
  ) {
    return this.sales.listLeads(principal, query);
  }

  @Post('leads')
  @RequirePermission('crm.lead.create')
  createLead(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateLeadDto,
  ) {
    return this.sales.createLead(principal, dto);
  }

  @Get('leads/:id')
  @RequirePermission('crm.lead.read')
  getLead(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sales.getLead(principal, id);
  }

  @Patch('leads/:id')
  @RequirePermission('crm.lead.update')
  updateLead(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.sales.updateLead(principal, id, dto);
  }

  @Get('deals')
  @RequirePermission('crm.deal.read')
  listDeals(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListQueryDto,
  ) {
    return this.sales.listDeals(principal, query);
  }

  @Post('deals')
  @RequirePermission('crm.deal.create')
  createDeal(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateDealDto,
  ) {
    return this.sales.createDeal(principal, dto);
  }

  @Get('deals/:id')
  @RequirePermission('crm.deal.read')
  getDeal(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sales.getDeal(principal, id);
  }

  @Patch('deals/:id')
  @RequirePermission('crm.deal.update')
  updateDeal(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDealDto,
  ) {
    return this.sales.updateDeal(principal, id, dto);
  }

  @Get('tasks')
  @RequirePermission('crm.task.read')
  listTasks(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListQueryDto,
  ) {
    return this.engagement.listTasks(principal, query);
  }

  @Post('tasks')
  @RequirePermission('crm.task.create')
  createTask(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateTaskDto,
  ) {
    return this.engagement.createTask(principal, dto);
  }

  @Patch('tasks/:id')
  @RequirePermission('crm.task.update')
  updateTask(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.engagement.updateTask(principal, id, dto);
  }

  @Get('appointments')
  @RequirePermission('crm.appointment.read')
  listAppointments(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListQueryDto,
  ) {
    return this.engagement.listAppointments(principal, query);
  }

  @Post('appointments')
  @RequirePermission('crm.appointment.create')
  createAppointment(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.engagement.createAppointment(principal, dto);
  }

  @Patch('appointments/:id')
  @RequirePermission('crm.appointment.update')
  updateAppointment(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.engagement.updateAppointment(principal, id, dto);
  }

  @Get('activities')
  @RequirePermission('crm.activity.read')
  listActivities(
    @CurrentPrincipal() principal: Principal,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number.parseInt(limit ?? '50', 10);
    return this.engagement.listActivities(
      principal,
      Number.isFinite(parsed) ? parsed : 50,
    );
  }

  @Post('activities')
  @RequirePermission('crm.activity.create')
  createActivity(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateActivityDto,
  ) {
    return this.engagement.createActivity(principal, dto);
  }

  @Get('notes')
  @RequirePermission('crm.note.read')
  listNotes(
    @CurrentPrincipal() principal: Principal,
    @Query('objectType') objectType: string,
    @Query('objectId', ParseUUIDPipe) objectId: string,
  ) {
    return this.engagement.listNotes(principal, objectType, objectId);
  }

  @Post('notes')
  @RequirePermission('crm.note.create')
  createNote(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateNoteDto,
  ) {
    return this.engagement.createNote(principal, dto);
  }

  @Get('tags')
  @RequirePermission('crm.tag.manage')
  listTags(@CurrentPrincipal() principal: Principal) {
    return this.settings.listTags(principal);
  }

  @Post('tags')
  @RequirePermission('crm.tag.manage')
  createTag(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateTagDto,
  ) {
    return this.settings.createTag(principal, dto);
  }

  @Get('custom-fields')
  @RequirePermission('crm.custom_field.manage')
  listCustomFields(
    @CurrentPrincipal() principal: Principal,
    @Query('objectType') objectType?: string,
  ) {
    return this.settings.listCustomFields(principal, objectType);
  }

  @Post('custom-fields')
  @RequirePermission('crm.custom_field.manage')
  createCustomField(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateCustomFieldDto,
  ) {
    return this.settings.createCustomField(principal, dto);
  }

  @Put('custom-field-values/:objectType/:objectId')
  @RequirePermission('crm.custom_field.manage')
  setCustomFieldValue(
    @CurrentPrincipal() principal: Principal,
    @Param('objectType') objectType: string,
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @Body() dto: SetCustomFieldValueDto,
  ) {
    return this.settings.setCustomFieldValue(
      principal,
      objectType,
      objectId,
      dto,
    );
  }

  @Get('lists')
  @RequirePermission('crm.list.manage')
  listSavedLists(
    @CurrentPrincipal() principal: Principal,
    @Query('objectType') objectType?: string,
  ) {
    return this.settings.listSavedLists(principal, objectType);
  }

  @Post('lists')
  @RequirePermission('crm.list.manage')
  createSavedList(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateSavedListDto,
  ) {
    return this.settings.createSavedList(principal, dto);
  }
}
