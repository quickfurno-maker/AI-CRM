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
  CreateBookingDto,
  CreateBrokerDto,
  CreateBuildingDto,
  CreateCommissionDto,
  CreateDeveloperDto,
  CreateOfferDto,
  CreateProjectDto,
  CreatePropertyOwnerDto,
  CreateRequirementDto,
  CreateSiteVisitDto,
  CreateUnitDto,
  MatchRequirementDto,
  RealEstateListQueryDto,
  UpdateBookingDto,
  UpdateRequirementDto,
  UpdateSiteVisitDto,
  UpdateUnitDto,
} from './dto/real-estate.dto.js';
import { RealEstateService } from './real-estate.service.js';

@Controller('real-estate')
@RequireEntitlement('extension.realestate')
export class RealEstateController {
  constructor(private readonly realEstate: RealEstateService) {}

  @Get('dashboard')
  @RequirePermission('realestate.inventory.read')
  dashboard(@CurrentPrincipal() principal: Principal) {
    return this.realEstate.dashboard(principal);
  }

  @Get('developers')
  @RequirePermission('realestate.inventory.read')
  developers(
    @CurrentPrincipal() principal: Principal,
    @Query() query: RealEstateListQueryDto,
  ) {
    return this.realEstate.listDevelopers(principal, query);
  }

  @Post('developers')
  @RequirePermission('realestate.inventory.manage')
  createDeveloper(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateDeveloperDto,
  ) {
    return this.realEstate.createDeveloper(principal, dto);
  }

  @Get('projects')
  @RequirePermission('realestate.inventory.read')
  projects(
    @CurrentPrincipal() principal: Principal,
    @Query() query: RealEstateListQueryDto,
  ) {
    return this.realEstate.listProjects(principal, query);
  }

  @Post('projects')
  @RequirePermission('realestate.inventory.manage')
  createProject(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateProjectDto,
  ) {
    return this.realEstate.createProject(principal, dto);
  }

  @Post('buildings')
  @RequirePermission('realestate.inventory.manage')
  createBuilding(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateBuildingDto,
  ) {
    return this.realEstate.createBuilding(principal, dto);
  }

  @Get('units')
  @RequirePermission('realestate.inventory.read')
  units(
    @CurrentPrincipal() principal: Principal,
    @Query() query: RealEstateListQueryDto,
  ) {
    return this.realEstate.listUnits(principal, query);
  }

  @Post('units')
  @RequirePermission('realestate.inventory.manage')
  createUnit(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateUnitDto,
  ) {
    return this.realEstate.createUnit(principal, dto);
  }

  @Patch('units/:id')
  @RequirePermission('realestate.inventory.manage')
  updateUnit(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnitDto,
  ) {
    return this.realEstate.updateUnit(principal, id, dto);
  }

  @Post('property-owners')
  @RequirePermission('realestate.inventory.manage')
  createPropertyOwner(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreatePropertyOwnerDto,
  ) {
    return this.realEstate.createPropertyOwner(principal, dto);
  }

  @Post('brokers')
  @RequirePermission('realestate.booking.manage')
  createBroker(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateBrokerDto,
  ) {
    return this.realEstate.createBroker(principal, dto);
  }

  @Get('requirements')
  @RequirePermission('realestate.requirement.read')
  requirements(
    @CurrentPrincipal() principal: Principal,
    @Query() query: RealEstateListQueryDto,
  ) {
    return this.realEstate.listRequirements(principal, query);
  }

  @Post('requirements')
  @RequirePermission('realestate.requirement.manage')
  createRequirement(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateRequirementDto,
  ) {
    return this.realEstate.createRequirement(principal, dto);
  }

  @Patch('requirements/:id')
  @RequirePermission('realestate.requirement.manage')
  updateRequirement(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequirementDto,
  ) {
    return this.realEstate.updateRequirement(principal, id, dto);
  }

  @Post('requirements/:id/match')
  @RequirePermission('realestate.requirement.manage')
  matchRequirement(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MatchRequirementDto,
  ) {
    return this.realEstate.matchRequirement(principal, id, dto);
  }

  @Get('requirements/:id/matches')
  @RequirePermission('realestate.requirement.read')
  matches(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.realEstate.listMatches(principal, id);
  }

  @Get('site-visits')
  @RequirePermission('realestate.visit.read')
  siteVisits(
    @CurrentPrincipal() principal: Principal,
    @Query() query: RealEstateListQueryDto,
  ) {
    return this.realEstate.listSiteVisits(principal, query);
  }

  @Post('site-visits')
  @RequirePermission('realestate.visit.manage')
  scheduleSiteVisit(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateSiteVisitDto,
  ) {
    return this.realEstate.scheduleSiteVisit(principal, dto);
  }

  @Patch('site-visits/:id')
  @RequirePermission('realestate.visit.manage')
  updateSiteVisit(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSiteVisitDto,
  ) {
    return this.realEstate.updateSiteVisit(principal, id, dto);
  }

  @Post('offers')
  @RequirePermission('realestate.booking.manage')
  createOffer(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateOfferDto,
  ) {
    return this.realEstate.createOffer(principal, dto);
  }

  @Get('bookings')
  @RequirePermission('realestate.booking.read')
  bookings(
    @CurrentPrincipal() principal: Principal,
    @Query() query: RealEstateListQueryDto,
  ) {
    return this.realEstate.listBookings(principal, query);
  }

  @Post('bookings')
  @RequirePermission('realestate.booking.manage')
  createBooking(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateBookingDto,
  ) {
    return this.realEstate.createBooking(principal, dto);
  }

  @Patch('bookings/:id')
  @RequirePermission('realestate.booking.manage')
  updateBooking(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingDto,
  ) {
    return this.realEstate.updateBooking(principal, id, dto);
  }

  @Post('commissions')
  @RequirePermission('realestate.booking.manage')
  createCommission(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateCommissionDto,
  ) {
    return this.realEstate.createCommission(principal, dto);
  }
}
