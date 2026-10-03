import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  auditLogs,
  organizationMembers,
  outboxEvents,
  workspaces,
} from '../../platform/database/schema.js';
import { EntitlementsService } from '../../platform/entitlements/entitlements.service.js';
import {
  appointments,
  contacts,
  deals,
  leads,
} from '../../modules/crm/crm.schema.js';
import type {
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
import {
  realEstateBookings,
  realEstateBrokers,
  realEstateBuildings,
  realEstateCommissions,
  realEstateDevelopers,
  realEstateOffers,
  realEstateProjects,
  realEstatePropertyOwners,
  realEstateRequirementMatches,
  realEstateRequirements,
  realEstateSiteVisits,
  realEstateUnits,
} from './real-estate.schema.js';

@Injectable()
export class RealEstateService {
  constructor(
    private readonly database: DatabaseService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async dashboard(principal: Principal) {
    await this.assertEnabled(principal);
    const org = principal.organizationId;
    const [projects, availableUnits, activeRequirements, upcomingVisits, bookings] =
      await Promise.all([
        this.database.db
          .select({ value: count() })
          .from(realEstateProjects)
          .where(eq(realEstateProjects.organizationId, org)),
        this.database.db
          .select({ value: count() })
          .from(realEstateUnits)
          .where(
            and(
              eq(realEstateUnits.organizationId, org),
              eq(realEstateUnits.inventoryStatus, 'AVAILABLE'),
            ),
          ),
        this.database.db
          .select({ value: count() })
          .from(realEstateRequirements)
          .where(
            and(
              eq(realEstateRequirements.organizationId, org),
              eq(realEstateRequirements.status, 'ACTIVE'),
            ),
          ),
        this.database.db
          .select({ value: count() })
          .from(realEstateSiteVisits)
          .where(
            and(
              eq(realEstateSiteVisits.organizationId, org),
              eq(realEstateSiteVisits.status, 'SCHEDULED'),
            ),
          ),
        this.database.db
          .select({ value: count() })
          .from(realEstateBookings)
          .where(eq(realEstateBookings.organizationId, org)),
      ]);

    return {
      projects: Number(projects[0]?.value ?? 0),
      availableUnits: Number(availableUnits[0]?.value ?? 0),
      activeRequirements: Number(activeRequirements[0]?.value ?? 0),
      upcomingVisits: Number(upcomingVisits[0]?.value ?? 0),
      bookings: Number(bookings[0]?.value ?? 0),
    };
  }

  async listDevelopers(principal: Principal, query: RealEstateListQueryDto) {
    await this.assertEnabled(principal);
    const rows = await this.database.db
      .select()
      .from(realEstateDevelopers)
      .where(eq(realEstateDevelopers.organizationId, principal.organizationId))
      .orderBy(desc(realEstateDevelopers.createdAt))
      .limit(query.limit);
    return this.filterSearch(rows, query.search, ['name', 'code']);
  }

  async createDeveloper(principal: Principal, dto: CreateDeveloperDto) {
    await this.assertEnabled(principal);
    const workspaceId = await this.resolveWorkspace(principal, dto.workspaceId);
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(realEstateDevelopers)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          name: dto.name.trim(),
          code: dto.code?.trim(),
          reraRegistration: dto.reraRegistration?.trim(),
          website: dto.website?.trim(),
          phone: dto.phone?.trim(),
          metadata: dto.metadata,
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'realestate.developer.created.v1',
        aggregateType: 'realestate_developer',
        aggregateId: row.id,
        payload: { developerId: row.id, workspaceId },
      });
      await this.audit(tx, principal, workspaceId, 'realestate.developer.create', 'realestate_developer', row.id, row);
      return row;
    });
  }

  async listProjects(principal: Principal, query: RealEstateListQueryDto) {
    await this.assertEnabled(principal);
    const rows = await this.database.db
      .select()
      .from(realEstateProjects)
      .where(eq(realEstateProjects.organizationId, principal.organizationId))
      .orderBy(desc(realEstateProjects.createdAt))
      .limit(query.limit);
    return this.filterSearch(
      query.status ? rows.filter((row) => row.status === query.status) : rows,
      query.search,
      ['name', 'code', 'city', 'locality', 'reraNumber'],
    );
  }

  async createProject(principal: Principal, dto: CreateProjectDto) {
    await this.assertEnabled(principal);
    const workspaceId = await this.resolveWorkspace(principal, dto.workspaceId);
    if (dto.developerId) {
      await this.assertOwned(
        realEstateDevelopers,
        principal.organizationId,
        dto.developerId,
        'Developer',
      );
    }
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(realEstateProjects)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          developerId: dto.developerId,
          name: dto.name.trim(),
          code: dto.code?.trim(),
          city: dto.city.trim(),
          locality: dto.locality.trim(),
          address: dto.address?.trim(),
          latitude: dto.latitude,
          longitude: dto.longitude,
          reraNumber: dto.reraNumber?.trim(),
          possessionDate: dto.possessionDate,
          propertyTypes: dto.propertyTypes ?? [],
          amenities: dto.amenities ?? [],
          minPrice: dto.minPrice,
          maxPrice: dto.maxPrice,
          currency: dto.currency ?? 'INR',
          metadata: dto.metadata,
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'realestate.project.created.v1',
        aggregateType: 'realestate_project',
        aggregateId: row.id,
        payload: {
          projectId: row.id,
          city: row.city,
          locality: row.locality,
          developerId: row.developerId,
        },
      });
      await this.audit(tx, principal, workspaceId, 'realestate.project.create', 'realestate_project', row.id, row);
      return row;
    });
  }

  async createBuilding(principal: Principal, dto: CreateBuildingDto) {
    await this.assertEnabled(principal);
    const project = await this.getProject(principal, dto.projectId);
    const workspaceId = dto.workspaceId
      ? await this.resolveWorkspace(principal, dto.workspaceId)
      : project.workspaceId;
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(realEstateBuildings)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          projectId: dto.projectId,
          name: dto.name.trim(),
          code: dto.code?.trim(),
          floors: dto.floors,
          possessionDate: dto.possessionDate,
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'realestate.building.created.v1',
        aggregateType: 'realestate_building',
        aggregateId: row.id,
        payload: { buildingId: row.id, projectId: row.projectId },
      });
      await this.audit(
        tx,
        principal,
        workspaceId,
        'realestate.building.create',
        'realestate_building',
        row.id,
        row,
      );
      return row;
    });
  }

  async listUnits(principal: Principal, query: RealEstateListQueryDto) {
    await this.assertEnabled(principal);
    let rows = await this.database.db
      .select({
        unit: realEstateUnits,
        projectName: realEstateProjects.name,
        projectCity: realEstateProjects.city,
        projectLocality: realEstateProjects.locality,
      })
      .from(realEstateUnits)
      .leftJoin(
        realEstateProjects,
        eq(realEstateProjects.id, realEstateUnits.projectId),
      )
      .where(eq(realEstateUnits.organizationId, principal.organizationId))
      .orderBy(desc(realEstateUnits.createdAt))
      .limit(Math.max(query.limit, 100));

    if (query.projectId) {
      rows = rows.filter((row) => row.unit.projectId === query.projectId);
    }
    if (query.status) {
      rows = rows.filter((row) => row.unit.inventoryStatus === query.status);
    }
    if (query.search) {
      const needle = query.search.toLowerCase();
      rows = rows.filter((row) =>
        [
          row.unit.title,
          row.unit.unitNumber,
          row.unit.configuration,
          row.unit.city,
          row.unit.locality,
          row.projectName,
          row.projectCity,
          row.projectLocality,
        ].some((value) => value?.toLowerCase().includes(needle)),
      );
    }
    return rows.slice(0, query.limit);
  }

  async createUnit(principal: Principal, dto: CreateUnitDto) {
    await this.assertEnabled(principal);
    const building = dto.buildingId
      ? await this.assertOwned(
          realEstateBuildings,
          principal.organizationId,
          dto.buildingId,
          'Building',
        )
      : undefined;
    const resolvedProjectId = dto.projectId ?? building?.projectId ?? undefined;
    const project = resolvedProjectId
      ? await this.getProject(principal, resolvedProjectId)
      : undefined;
    if (
      dto.projectId &&
      building?.projectId &&
      building.projectId !== dto.projectId
    ) {
      throw new BadRequestException('Building does not belong to project.');
    }
    const workspaceId = dto.workspaceId
      ? await this.resolveWorkspace(principal, dto.workspaceId)
      : project?.workspaceId ?? await this.resolveWorkspace(principal);
    if (project && workspaceId !== project.workspaceId) {
      throw new BadRequestException(
        'Unit workspace must match the selected project workspace.',
      );
    }
    if (dto.propertyOwnerId) {
      await this.assertOwned(
        realEstatePropertyOwners,
        principal.organizationId,
        dto.propertyOwnerId,
        'Property owner',
      );
    }

    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(realEstateUnits)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          projectId: dto.projectId,
          buildingId: dto.buildingId,
          propertyOwnerId: dto.propertyOwnerId,
          unitNumber: dto.unitNumber?.trim(),
          title: dto.title.trim(),
          city: dto.city?.trim() ?? project?.city,
          locality: dto.locality?.trim() ?? project?.locality,
          address: dto.address?.trim() ?? project?.address,
          latitude: dto.latitude ?? project?.latitude,
          longitude: dto.longitude ?? project?.longitude,
          propertyType: dto.propertyType,
          configuration: dto.configuration?.trim(),
          bedrooms: dto.bedrooms,
          bathrooms: dto.bathrooms,
          carpetArea: dto.carpetArea,
          builtUpArea: dto.builtUpArea,
          areaUnit: dto.areaUnit ?? 'SQFT',
          floor: dto.floor,
          facing: dto.facing?.trim(),
          price: dto.price,
          currency: dto.currency ?? 'INR',
          inventoryStatus: dto.inventoryStatus ?? 'AVAILABLE',
          possessionStatus: dto.possessionStatus?.trim(),
          availableFrom: dto.availableFrom,
          amenities: dto.amenities ?? [],
          metadata: dto.metadata,
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'realestate.unit.created.v1',
        aggregateType: 'realestate_unit',
        aggregateId: row.id,
        payload: {
          unitId: row.id,
          projectId: row.projectId,
          inventoryStatus: row.inventoryStatus,
        },
      });
      await this.audit(
        tx,
        principal,
        workspaceId,
        'realestate.unit.create',
        'realestate_unit',
        row.id,
        row,
      );
      return row;
    });
  }

  async updateUnit(principal: Principal, id: string, dto: UpdateUnitDto) {
    await this.assertEnabled(principal);
    const before = await this.getUnit(principal, id);
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(realEstateUnits)
        .set({
          title: dto.title?.trim(),
          configuration: dto.configuration?.trim(),
          carpetArea: dto.carpetArea,
          builtUpArea: dto.builtUpArea,
          price: dto.price,
          inventoryStatus: dto.inventoryStatus,
          possessionStatus: dto.possessionStatus?.trim(),
          amenities: dto.amenities,
          metadata: dto.metadata,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(realEstateUnits.organizationId, principal.organizationId),
            eq(realEstateUnits.id, id),
          ),
        )
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'realestate.unit.updated.v1',
        aggregateType: 'realestate_unit',
        aggregateId: id,
        payload: { unitId: id, inventoryStatus: row.inventoryStatus },
      });
      await this.audit(
        tx,
        principal,
        row.workspaceId,
        'realestate.unit.update',
        'realestate_unit',
        id,
        row,
        before,
      );
      return row;
    });
  }

  async createPropertyOwner(principal: Principal, dto: CreatePropertyOwnerDto) {
    await this.assertEnabled(principal);
    await this.assertCrmRecord(contacts, principal.organizationId, dto.contactId, 'Contact');
    const workspaceId = await this.resolveWorkspace(principal, dto.workspaceId);
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(realEstatePropertyOwners)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          contactId: dto.contactId,
          ownerType: dto.ownerType ?? 'INDIVIDUAL',
          notes: dto.notes?.trim(),
        })
        .onConflictDoUpdate({
          target: [
            realEstatePropertyOwners.organizationId,
            realEstatePropertyOwners.contactId,
          ],
          set: {
            ownerType: dto.ownerType ?? 'INDIVIDUAL',
            notes: dto.notes?.trim(),
            updatedAt: new Date(),
          },
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'realestate.property_owner.upserted.v1',
        aggregateType: 'realestate_property_owner',
        aggregateId: row.id,
        payload: { propertyOwnerId: row.id, contactId: row.contactId },
      });
      await this.audit(
        tx,
        principal,
        workspaceId,
        'realestate.property_owner.upsert',
        'realestate_property_owner',
        row.id,
        row,
      );
      return row;
    });
  }

  async createBroker(principal: Principal, dto: CreateBrokerDto) {
    await this.assertEnabled(principal);
    await this.assertCrmRecord(contacts, principal.organizationId, dto.contactId, 'Contact');
    const workspaceId = await this.resolveWorkspace(principal, dto.workspaceId);
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(realEstateBrokers)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          contactId: dto.contactId,
          firmName: dto.firmName?.trim(),
          registrationNumber: dto.registrationNumber?.trim(),
          metadata: dto.metadata,
        })
        .onConflictDoUpdate({
          target: [realEstateBrokers.organizationId, realEstateBrokers.contactId],
          set: {
            firmName: dto.firmName?.trim(),
            registrationNumber: dto.registrationNumber?.trim(),
            metadata: dto.metadata,
            updatedAt: new Date(),
          },
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'realestate.broker.upserted.v1',
        aggregateType: 'realestate_broker',
        aggregateId: row.id,
        payload: { brokerId: row.id, contactId: row.contactId },
      });
      await this.audit(
        tx,
        principal,
        workspaceId,
        'realestate.broker.upsert',
        'realestate_broker',
        row.id,
        row,
      );
      return row;
    });
  }

  async listRequirements(principal: Principal, query: RealEstateListQueryDto) {
    await this.assertEnabled(principal);
    let rows = await this.database.db
      .select()
      .from(realEstateRequirements)
      .where(eq(realEstateRequirements.organizationId, principal.organizationId))
      .orderBy(desc(realEstateRequirements.createdAt))
      .limit(query.limit);
    if (query.status) rows = rows.filter((row) => row.status === query.status);
    return rows;
  }

  async createRequirement(principal: Principal, dto: CreateRequirementDto) {
    await this.assertEnabled(principal);
    await this.assertCrmRecord(contacts, principal.organizationId, dto.contactId, 'Contact');
    if (dto.leadId) {
      await this.assertCrmRecord(leads, principal.organizationId, dto.leadId, 'Lead');
    }
    const workspaceId = await this.resolveWorkspace(principal, dto.workspaceId);
    const ownerMemberId = await this.resolveMember(
      principal,
      dto.ownerMemberId ?? principal.membershipId,
    );
    this.validateRange(dto.minBudget, dto.maxBudget, 'budget');
    this.validateRange(dto.minCarpetArea, dto.maxCarpetArea, 'carpet area');

    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(realEstateRequirements)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          contactId: dto.contactId,
          leadId: dto.leadId,
          ownerMemberId,
          purpose: dto.purpose ?? 'SELF_USE',
          cities: dto.cities ?? [],
          localities: dto.localities ?? [],
          propertyTypes: dto.propertyTypes ?? [],
          configurations: dto.configurations ?? [],
          minBudget: dto.minBudget,
          maxBudget: dto.maxBudget,
          currency: dto.currency ?? 'INR',
          minCarpetArea: dto.minCarpetArea,
          maxCarpetArea: dto.maxCarpetArea,
          purchaseTimeline: dto.purchaseTimeline?.trim(),
          possessionPreference: dto.possessionPreference?.trim(),
          mustHaveAmenities: dto.mustHaveAmenities ?? [],
          notes: dto.notes?.trim(),
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'realestate.requirement.created.v1',
        aggregateType: 'realestate_requirement',
        aggregateId: row.id,
        payload: {
          requirementId: row.id,
          contactId: row.contactId,
          leadId: row.leadId,
        },
      });
      await this.audit(
        tx,
        principal,
        workspaceId,
        'realestate.requirement.create',
        'realestate_requirement',
        row.id,
        row,
      );
      return row;
    });
  }

  async updateRequirement(
    principal: Principal,
    id: string,
    dto: UpdateRequirementDto,
  ) {
    await this.assertEnabled(principal);
    const before = await this.getRequirement(principal, id);
    const minBudget = dto.minBudget ?? before.minBudget ?? undefined;
    const maxBudget = dto.maxBudget ?? before.maxBudget ?? undefined;
    const minArea = dto.minCarpetArea ?? before.minCarpetArea ?? undefined;
    const maxArea = dto.maxCarpetArea ?? before.maxCarpetArea ?? undefined;
    this.validateRange(minBudget, maxBudget, 'budget');
    this.validateRange(minArea, maxArea, 'carpet area');

    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(realEstateRequirements)
        .set({
          purpose: dto.purpose,
          cities: dto.cities,
          localities: dto.localities,
          propertyTypes: dto.propertyTypes,
          configurations: dto.configurations,
          minBudget: dto.minBudget,
          maxBudget: dto.maxBudget,
          minCarpetArea: dto.minCarpetArea,
          maxCarpetArea: dto.maxCarpetArea,
          purchaseTimeline: dto.purchaseTimeline?.trim(),
          possessionPreference: dto.possessionPreference?.trim(),
          mustHaveAmenities: dto.mustHaveAmenities,
          status: dto.status,
          notes: dto.notes?.trim(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(realEstateRequirements.organizationId, principal.organizationId),
            eq(realEstateRequirements.id, id),
          ),
        )
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'realestate.requirement.updated.v1',
        aggregateType: 'realestate_requirement',
        aggregateId: row.id,
        payload: { requirementId: row.id, status: row.status },
      });
      await this.audit(
        tx,
        principal,
        row.workspaceId,
        'realestate.requirement.update',
        'realestate_requirement',
        row.id,
        row,
        before,
      );
      return row;
    });
  }

  async matchRequirement(
    principal: Principal,
    id: string,
    dto: MatchRequirementDto,
  ) {
    await this.assertEnabled(principal);
    const requirement = await this.getRequirement(principal, id);
    const candidateConditions = [
      eq(realEstateUnits.organizationId, principal.organizationId),
      eq(realEstateUnits.inventoryStatus, 'AVAILABLE'),
    ];
    if (requirement.cities.length) {
      candidateConditions.push(
        inArray(
          sql`lower(${realEstateUnits.city})`,
          requirement.cities.map((value) => value.trim().toLowerCase()),
        ),
      );
    }
    if (requirement.localities.length) {
      candidateConditions.push(
        inArray(
          sql`lower(${realEstateUnits.locality})`,
          requirement.localities.map((value) => value.trim().toLowerCase()),
        ),
      );
    }
    if (requirement.propertyTypes.length) {
      candidateConditions.push(
        inArray(
          sql`lower(${realEstateUnits.propertyType})`,
          requirement.propertyTypes.map((value) => value.trim().toLowerCase()),
        ),
      );
    }
    if (requirement.configurations.length) {
      candidateConditions.push(
        inArray(
          sql`lower(${realEstateUnits.configuration})`,
          requirement.configurations.map((value) => value.trim().toLowerCase()),
        ),
      );
    }
    if (requirement.minBudget !== null) {
      candidateConditions.push(
        gte(realEstateUnits.price, requirement.minBudget),
      );
    }
    if (requirement.maxBudget !== null) {
      candidateConditions.push(
        lte(realEstateUnits.price, requirement.maxBudget),
      );
    }
    if (requirement.minCarpetArea !== null) {
      candidateConditions.push(
        gte(realEstateUnits.carpetArea, requirement.minCarpetArea),
      );
    }
    if (requirement.maxCarpetArea !== null) {
      candidateConditions.push(
        lte(realEstateUnits.carpetArea, requirement.maxCarpetArea),
      );
    }

    const candidates = await this.database.db
      .select({ unit: realEstateUnits, project: realEstateProjects })
      .from(realEstateUnits)
      .leftJoin(
        realEstateProjects,
        eq(realEstateProjects.id, realEstateUnits.projectId),
      )
      .where(and(...candidateConditions))
      .limit(250);

    const scored = candidates
      .map((candidate) => this.scoreCandidate(requirement, candidate))
      .filter(
        (candidate): candidate is NonNullable<typeof candidate> =>
          candidate !== null,
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, dto.limit);

    await this.database.db.transaction(async (tx) => {
      await tx
        .delete(realEstateRequirementMatches)
        .where(
          and(
            eq(
              realEstateRequirementMatches.organizationId,
              principal.organizationId,
            ),
            eq(
              realEstateRequirementMatches.requirementId,
              requirement.id,
            ),
          ),
        );

      for (const candidate of scored) {
        await tx.insert(realEstateRequirementMatches).values({
          organizationId: principal.organizationId,
          requirementId: requirement.id,
          unitId: candidate.unit.id,
          score: candidate.score,
          reasons: candidate.reasons,
        });
      }

      const [updatedRequirement] = await tx
        .update(realEstateRequirements)
        .set({
          status: scored.length ? 'MATCHED' : 'ACTIVE',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(realEstateRequirements.organizationId, principal.organizationId),
            eq(realEstateRequirements.id, requirement.id),
          ),
        )
        .returning();

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'realestate.requirement.matched.v1',
        aggregateType: 'realestate_requirement',
        aggregateId: requirement.id,
        payload: {
          requirementId: requirement.id,
          matchCount: scored.length,
          matches: scored.map((item) => ({
            unitId: item.unit.id,
            score: item.score,
          })),
        },
      });
      await this.audit(
        tx,
        principal,
        requirement.workspaceId,
        'realestate.requirement.match',
        'realestate_requirement',
        requirement.id,
        updatedRequirement,
        requirement,
      );
    });

    return scored;
  }

  async listMatches(principal: Principal, requirementId: string) {
    await this.assertEnabled(principal);
    await this.getRequirement(principal, requirementId);
    return this.database.db
      .select({
        match: realEstateRequirementMatches,
        unit: realEstateUnits,
        project: realEstateProjects,
      })
      .from(realEstateRequirementMatches)
      .innerJoin(
        realEstateUnits,
        eq(realEstateUnits.id, realEstateRequirementMatches.unitId),
      )
      .leftJoin(
        realEstateProjects,
        eq(realEstateProjects.id, realEstateUnits.projectId),
      )
      .where(
        and(
          eq(
            realEstateRequirementMatches.organizationId,
            principal.organizationId,
          ),
          eq(realEstateRequirementMatches.requirementId, requirementId),
        ),
      )
      .orderBy(desc(realEstateRequirementMatches.score));
  }

  async listSiteVisits(principal: Principal, query: RealEstateListQueryDto) {
    await this.assertEnabled(principal);
    let rows = await this.database.db
      .select()
      .from(realEstateSiteVisits)
      .where(eq(realEstateSiteVisits.organizationId, principal.organizationId))
      .orderBy(desc(realEstateSiteVisits.scheduledAt))
      .limit(query.limit);
    if (query.status) rows = rows.filter((row) => row.status === query.status);
    return rows;
  }

  async scheduleSiteVisit(principal: Principal, dto: CreateSiteVisitDto) {
    await this.assertEnabled(principal);
    if (!dto.projectId && !dto.unitId) {
      throw new BadRequestException(
        'Site visit requires a project or a property unit.',
      );
    }
    const unit = dto.unitId
      ? await this.getUnit(principal, dto.unitId)
      : undefined;
    const resolvedProjectId = dto.projectId ?? unit?.projectId ?? undefined;
    const project = resolvedProjectId
      ? await this.getProject(principal, resolvedProjectId)
      : undefined;
    if (
      dto.projectId &&
      unit?.projectId &&
      unit.projectId !== dto.projectId
    ) {
      throw new BadRequestException(
        'Unit does not belong to the selected project.',
      );
    }
    const workspaceId = dto.workspaceId
      ? await this.resolveWorkspace(principal, dto.workspaceId)
      : project?.workspaceId ?? unit?.workspaceId;
    if (!workspaceId) {
      throw new BadRequestException('Unable to resolve site visit workspace.');
    }
    await this.assertCrmRecord(contacts, principal.organizationId, dto.contactId, 'Contact');
    if (dto.leadId) await this.assertCrmRecord(leads, principal.organizationId, dto.leadId, 'Lead');
    if (dto.dealId) await this.assertCrmRecord(deals, principal.organizationId, dto.dealId, 'Deal');
    if (dto.requirementId) await this.getRequirement(principal, dto.requirementId);
    const ownerMemberId = await this.resolveMember(
      principal,
      dto.ownerMemberId ?? principal.membershipId,
    );
    const start = new Date(dto.scheduledAt);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException('Invalid site visit time.');
    }
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    return this.database.db.transaction(async (tx) => {
      const [appointment] = await tx
        .insert(appointments)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          ownerMemberId,
          contactId: dto.contactId,
          leadId: dto.leadId,
          dealId: dto.dealId,
          title: `Site visit · ${project?.name ?? unit?.title ?? 'Property'}`,
          startsAt: start,
          endsAt: end,
          timezone: 'Asia/Kolkata',
          location: [
            unit?.address ?? project?.address,
            unit?.locality ?? project?.locality,
            unit?.city ?? project?.city,
          ]
            .filter(Boolean)
            .join(', '),
          notes: dto.notes?.trim(),
        })
        .returning();

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'crm.appointment.created.v1',
        aggregateType: 'appointment',
        aggregateId: appointment.id,
        payload: {
          appointmentId: appointment.id,
          startsAt: appointment.startsAt,
          ownerMemberId,
          source: 'REAL_ESTATE_SITE_VISIT',
        },
      });
      await this.audit(
        tx,
        principal,
        workspaceId,
        'crm.appointment.create',
        'appointment',
        appointment.id,
        appointment,
      );

      const [row] = await tx
        .insert(realEstateSiteVisits)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          requirementId: dto.requirementId,
          contactId: dto.contactId,
          leadId: dto.leadId,
          dealId: dto.dealId,
          projectId: project?.id,
          unitId: dto.unitId,
          appointmentId: appointment.id,
          ownerMemberId,
          scheduledAt: start,
          notes: dto.notes?.trim(),
        })
        .returning();

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'realestate.site_visit.scheduled.v1',
        aggregateType: 'realestate_site_visit',
        aggregateId: row.id,
        payload: {
          siteVisitId: row.id,
          appointmentId: appointment.id,
          projectId: row.projectId,
          unitId: row.unitId,
          contactId: row.contactId,
          scheduledAt: row.scheduledAt,
        },
      });
      await this.audit(
        tx,
        principal,
        workspaceId,
        'realestate.site_visit.schedule',
        'realestate_site_visit',
        row.id,
        row,
      );
      return { ...row, appointment };
    });
  }

  async updateSiteVisit(
    principal: Principal,
    id: string,
    dto: UpdateSiteVisitDto,
  ) {
    await this.assertEnabled(principal);
    const before = await this.getSiteVisit(principal, id);
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(realEstateSiteVisits)
        .set({
          status: dto.status,
          outcome: dto.outcome?.trim(),
          notes: dto.notes?.trim(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(realEstateSiteVisits.organizationId, principal.organizationId),
            eq(realEstateSiteVisits.id, id),
          ),
        )
        .returning();

      if (row.appointmentId && dto.status) {
        const appointmentStatus =
          dto.status === 'COMPLETED'
            ? 'COMPLETED'
            : dto.status === 'CANCELLED'
              ? 'CANCELLED'
              : dto.status === 'NO_SHOW'
                ? 'NO_SHOW'
                : 'SCHEDULED';
        const [appointment] = await tx
          .update(appointments)
          .set({
            status: appointmentStatus,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(appointments.organizationId, principal.organizationId),
              eq(appointments.id, row.appointmentId),
            ),
          )
          .returning();
        if (!appointment) {
          throw new NotFoundException('Linked CRM appointment not found.');
        }
        await tx.insert(outboxEvents).values({
          organizationId: principal.organizationId,
          eventType: 'crm.appointment.updated.v1',
          aggregateType: 'appointment',
          aggregateId: appointment.id,
          payload: {
            appointmentId: appointment.id,
            status: appointment.status,
            source: 'REAL_ESTATE_SITE_VISIT',
          },
        });
        await this.audit(
          tx,
          principal,
          appointment.workspaceId,
          'crm.appointment.update',
          'appointment',
          appointment.id,
          appointment,
        );
      }

      const eventType =
        row.status === 'COMPLETED'
          ? 'realestate.site_visit.completed.v1'
          : 'realestate.site_visit.updated.v1';
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType,
        aggregateType: 'realestate_site_visit',
        aggregateId: row.id,
        payload: {
          siteVisitId: row.id,
          status: row.status,
          outcome: row.outcome,
          projectId: row.projectId,
          unitId: row.unitId,
        },
      });
      await this.audit(
        tx,
        principal,
        row.workspaceId,
        'realestate.site_visit.update',
        'realestate_site_visit',
        row.id,
        row,
        before,
      );
      return row;
    });
  }

  async createOffer(principal: Principal, dto: CreateOfferDto) {
    await this.assertEnabled(principal);
    const unit = await this.getUnit(principal, dto.unitId);
    if (dto.requirementId) await this.getRequirement(principal, dto.requirementId);
    if (dto.dealId) await this.assertCrmRecord(deals, principal.organizationId, dto.dealId, 'Deal');
    const workspaceId = dto.workspaceId
      ? await this.resolveWorkspace(principal, dto.workspaceId)
      : unit.workspaceId;
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(realEstateOffers)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          requirementId: dto.requirementId,
          dealId: dto.dealId,
          unitId: dto.unitId,
          amount: dto.amount,
          currency: dto.currency ?? unit.currency,
          validUntil: dto.validUntil,
          notes: dto.notes?.trim(),
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'realestate.offer.created.v1',
        aggregateType: 'realestate_offer',
        aggregateId: row.id,
        payload: {
          offerId: row.id,
          unitId: row.unitId,
          dealId: row.dealId,
          amount: row.amount,
        },
      });
      await this.audit(
        tx,
        principal,
        workspaceId,
        'realestate.offer.create',
        'realestate_offer',
        row.id,
        row,
      );
      return row;
    });
  }

  async listBookings(principal: Principal, query: RealEstateListQueryDto) {
    await this.assertEnabled(principal);
    let rows = await this.database.db
      .select()
      .from(realEstateBookings)
      .where(eq(realEstateBookings.organizationId, principal.organizationId))
      .orderBy(desc(realEstateBookings.bookedAt))
      .limit(query.limit);
    if (query.status) rows = rows.filter((row) => row.status === query.status);
    return rows;
  }

  async createBooking(principal: Principal, dto: CreateBookingDto) {
    await this.assertEnabled(principal);
    const unit = await this.getUnit(principal, dto.unitId);
    if (unit.inventoryStatus !== 'AVAILABLE') {
      throw new ConflictException('Unit is not available for booking.');
    }
    await this.assertCrmRecord(contacts, principal.organizationId, dto.contactId, 'Contact');
    if (dto.requirementId) await this.getRequirement(principal, dto.requirementId);
    if (dto.dealId) await this.assertCrmRecord(deals, principal.organizationId, dto.dealId, 'Deal');
    if (dto.offerId) await this.assertOwned(realEstateOffers, principal.organizationId, dto.offerId, 'Offer');
    if (dto.brokerId) await this.assertOwned(realEstateBrokers, principal.organizationId, dto.brokerId, 'Broker');
    const workspaceId = dto.workspaceId
      ? await this.resolveWorkspace(principal, dto.workspaceId)
      : unit.workspaceId;

    return this.database.db.transaction(async (tx) => {
      const [claimedUnit] = await tx
        .update(realEstateUnits)
        .set({ inventoryStatus: 'HOLD', updatedAt: new Date() })
        .where(
          and(
            eq(realEstateUnits.organizationId, principal.organizationId),
            eq(realEstateUnits.id, dto.unitId),
            eq(realEstateUnits.inventoryStatus, 'AVAILABLE'),
          ),
        )
        .returning({ id: realEstateUnits.id });
      if (!claimedUnit) {
        throw new ConflictException('Unit is no longer available.');
      }

      const [row] = await tx
        .insert(realEstateBookings)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          contactId: dto.contactId,
          requirementId: dto.requirementId,
          dealId: dto.dealId,
          offerId: dto.offerId,
          unitId: dto.unitId,
          brokerId: dto.brokerId,
          bookingAmount: dto.bookingAmount,
          currency: dto.currency ?? unit.currency,
          externalReference: dto.externalReference?.trim(),
          notes: dto.notes?.trim(),
        })
        .returning();

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'realestate.booking.created.v1',
        aggregateType: 'realestate_booking',
        aggregateId: row.id,
        payload: {
          bookingId: row.id,
          unitId: row.unitId,
          contactId: row.contactId,
          dealId: row.dealId,
          status: row.status,
        },
      });
      await this.audit(tx, principal, workspaceId, 'realestate.booking.create', 'realestate_booking', row.id, row);
      return row;
    });
  }

  async updateBooking(
    principal: Principal,
    id: string,
    dto: UpdateBookingDto,
  ) {
    await this.assertEnabled(principal);
    const before = await this.getBooking(principal, id);
    const allowedTransitions: Record<string, string[]> = {
      RESERVED: ['RESERVED', 'CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['CONFIRMED', 'CANCELLED'],
      CANCELLED: ['CANCELLED'],
    };
    if (!(allowedTransitions[before.status] ?? []).includes(dto.status)) {
      throw new ConflictException(
        `Invalid booking transition: ${before.status} → ${dto.status}.`,
      );
    }
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(realEstateBookings)
        .set({
          status: dto.status,
          notes: dto.notes?.trim(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(realEstateBookings.organizationId, principal.organizationId),
            eq(realEstateBookings.id, id),
          ),
        )
        .returning();

      await tx
        .update(realEstateUnits)
        .set({
          inventoryStatus:
            dto.status === 'CANCELLED'
              ? 'AVAILABLE'
              : dto.status === 'CONFIRMED'
                ? 'BOOKED'
                : 'HOLD',
          updatedAt: new Date(),
        })
        .where(eq(realEstateUnits.id, row.unitId));

      const eventType =
        dto.status === 'CONFIRMED'
          ? 'realestate.booking.confirmed.v1'
          : dto.status === 'CANCELLED'
            ? 'realestate.booking.cancelled.v1'
            : 'realestate.booking.updated.v1';
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType,
        aggregateType: 'realestate_booking',
        aggregateId: row.id,
        payload: {
          bookingId: row.id,
          unitId: row.unitId,
          dealId: row.dealId,
          status: row.status,
        },
      });
      await this.audit(tx, principal, row.workspaceId, 'realestate.booking.update', 'realestate_booking', row.id, row, before);
      return row;
    });
  }

  async createCommission(principal: Principal, dto: CreateCommissionDto) {
    await this.assertEnabled(principal);
    const booking = await this.getBooking(principal, dto.bookingId);
    if (dto.brokerId) {
      await this.assertOwned(realEstateBrokers, principal.organizationId, dto.brokerId, 'Broker');
    }
    const workspaceId = dto.workspaceId
      ? await this.resolveWorkspace(principal, dto.workspaceId)
      : booking.workspaceId;
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(realEstateCommissions)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          bookingId: dto.bookingId,
          brokerId: dto.brokerId,
          commissionType: dto.commissionType ?? 'FIXED',
          rate: dto.rate,
          amount: dto.amount,
          currency: dto.currency ?? booking.currency,
          payableAt: dto.payableAt,
          notes: dto.notes?.trim(),
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'realestate.commission.created.v1',
        aggregateType: 'realestate_commission',
        aggregateId: row.id,
        payload: {
          commissionId: row.id,
          bookingId: row.bookingId,
          brokerId: row.brokerId,
          amount: row.amount,
        },
      });
      await this.audit(
        tx,
        principal,
        workspaceId,
        'realestate.commission.create',
        'realestate_commission',
        row.id,
        row,
      );
      return row;
    });
  }

  async searchProperties(
    principal: Principal,
    filters: {
      city?: string;
      locality?: string;
      propertyType?: string;
      configuration?: string;
      maxPrice?: number;
      minCarpetArea?: number;
      limit?: number;
    },
  ) {
    await this.assertEnabled(principal);
    const conditions = [
      eq(realEstateUnits.organizationId, principal.organizationId),
      eq(realEstateUnits.inventoryStatus, 'AVAILABLE'),
    ];
    if (filters.city) {
      conditions.push(
        sql`lower(${realEstateUnits.city}) = ${filters.city.trim().toLowerCase()}`,
      );
    }
    if (filters.locality) {
      conditions.push(
        sql`lower(${realEstateUnits.locality}) = ${filters.locality.trim().toLowerCase()}`,
      );
    }
    if (filters.propertyType) {
      conditions.push(
        sql`lower(${realEstateUnits.propertyType}) = ${filters.propertyType.trim().toLowerCase()}`,
      );
    }
    if (filters.configuration) {
      conditions.push(
        sql`lower(${realEstateUnits.configuration}) = ${filters.configuration.trim().toLowerCase()}`,
      );
    }
    if (filters.maxPrice !== undefined) {
      conditions.push(lte(realEstateUnits.price, String(filters.maxPrice)));
    }
    if (filters.minCarpetArea !== undefined) {
      conditions.push(
        gte(realEstateUnits.carpetArea, String(filters.minCarpetArea)),
      );
    }

    return this.database.db
      .select({ unit: realEstateUnits, project: realEstateProjects })
      .from(realEstateUnits)
      .leftJoin(
        realEstateProjects,
        eq(realEstateProjects.id, realEstateUnits.projectId),
      )
      .where(and(...conditions))
      .orderBy(desc(realEstateUnits.createdAt))
      .limit(filters.limit ?? 10);
  }

  async compareProperties(
    principal: Principal,
    unitIds: string[],
  ) {
    await this.assertEnabled(principal);
    const uniqueIds = [...new Set(unitIds)];
    if (uniqueIds.length < 2 || uniqueIds.length > 5) {
      throw new BadRequestException(
        'Property comparison requires between 2 and 5 unique units.',
      );
    }

    const rows = await this.database.db
      .select({ unit: realEstateUnits, project: realEstateProjects })
      .from(realEstateUnits)
      .leftJoin(
        realEstateProjects,
        eq(realEstateProjects.id, realEstateUnits.projectId),
      )
      .where(
        and(
          eq(realEstateUnits.organizationId, principal.organizationId),
          inArray(realEstateUnits.id, uniqueIds),
        ),
      );

    if (rows.length !== uniqueIds.length) {
      throw new NotFoundException(
        'One or more requested property units were not found.',
      );
    }

    const byId = new Map(rows.map((row) => [row.unit.id, row]));
    const ordered = uniqueIds.map((id) => byId.get(id)!);

    const numeric = (
      value: string | number | null | undefined,
    ): number | null => {
      if (value === null || value === undefined) return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    return {
      units: ordered.map(({ unit, project }) => ({
        id: unit.id,
        title: unit.title,
        project: project
          ? {
              id: project.id,
              name: project.name,
              city: project.city,
              locality: project.locality,
              possessionDate: project.possessionDate,
              amenities: project.amenities,
            }
          : null,
        city: unit.city ?? project?.city ?? null,
        locality: unit.locality ?? project?.locality ?? null,
        propertyType: unit.propertyType,
        configuration: unit.configuration,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        carpetArea: numeric(unit.carpetArea),
        builtUpArea: numeric(unit.builtUpArea),
        areaUnit: unit.areaUnit,
        floor: unit.floor,
        facing: unit.facing,
        price: numeric(unit.price),
        currency: unit.currency,
        inventoryStatus: unit.inventoryStatus,
        possessionStatus: unit.possessionStatus,
        amenities: unit.amenities,
      })),
      comparison: {
        lowestPriceUnitId:
          ordered
            .filter(({ unit }) => unit.price !== null)
            .sort(
              (a, b) =>
                Number(a.unit.price) - Number(b.unit.price),
            )[0]?.unit.id ?? null,
        largestCarpetAreaUnitId:
          ordered
            .filter(({ unit }) => unit.carpetArea !== null)
            .sort(
              (a, b) =>
                Number(b.unit.carpetArea) -
                Number(a.unit.carpetArea),
            )[0]?.unit.id ?? null,
      },
    };
  }

  async getProject(principal: Principal, id: string) {
    await this.assertEnabled(principal);
    return this.assertOwned(
      realEstateProjects,
      principal.organizationId,
      id,
      'Project',
    );
  }

  async getUnit(principal: Principal, id: string) {
    await this.assertEnabled(principal);
    return this.assertOwned(
      realEstateUnits,
      principal.organizationId,
      id,
      'Unit',
    );
  }

  async getRequirement(principal: Principal, id: string) {
    await this.assertEnabled(principal);
    return this.assertOwned(
      realEstateRequirements,
      principal.organizationId,
      id,
      'Requirement',
    );
  }

  private async getSiteVisit(principal: Principal, id: string) {
    return this.assertOwned(
      realEstateSiteVisits,
      principal.organizationId,
      id,
      'Site visit',
    );
  }

  private async getBooking(principal: Principal, id: string) {
    return this.assertOwned(
      realEstateBookings,
      principal.organizationId,
      id,
      'Booking',
    );
  }

  private scoreCandidate(
    requirement: typeof realEstateRequirements.$inferSelect,
    candidate: {
      unit: typeof realEstateUnits.$inferSelect;
      project: typeof realEstateProjects.$inferSelect | null;
    },
  ) {
    const { unit, project } = candidate;
    const lower = (value?: string | null) => value?.trim().toLowerCase();
    const city = lower(unit.city ?? project?.city);
    const locality = lower(unit.locality ?? project?.locality);
    const requiredCities = requirement.cities.map((value) => lower(value));
    const requiredLocalities = requirement.localities.map((value) => lower(value));
    const requiredTypes = requirement.propertyTypes.map((value) => lower(value));
    const requiredConfigs = requirement.configurations.map((value) => lower(value));
    const unitAmenities = new Set(unit.amenities.map((value) => lower(value)));

    if (requiredCities.length && (!city || !requiredCities.includes(city))) return null;
    if (
      requiredLocalities.length &&
      (!locality || !requiredLocalities.includes(locality))
    ) {
      return null;
    }
    if (
      requiredTypes.length &&
      !requiredTypes.includes(lower(unit.propertyType))
    ) {
      return null;
    }
    if (
      requiredConfigs.length &&
      (!unit.configuration ||
        !requiredConfigs.includes(lower(unit.configuration)))
    ) {
      return null;
    }

    const price = unit.price === null ? undefined : Number(unit.price);
    const minBudget =
      requirement.minBudget === null ? undefined : Number(requirement.minBudget);
    const maxBudget =
      requirement.maxBudget === null ? undefined : Number(requirement.maxBudget);
    if (price !== undefined && minBudget !== undefined && price < minBudget) return null;
    if (price !== undefined && maxBudget !== undefined && price > maxBudget) return null;
    if ((minBudget !== undefined || maxBudget !== undefined) && price === undefined) return null;

    const carpet =
      unit.carpetArea === null ? undefined : Number(unit.carpetArea);
    const minCarpet =
      requirement.minCarpetArea === null
        ? undefined
        : Number(requirement.minCarpetArea);
    const maxCarpet =
      requirement.maxCarpetArea === null
        ? undefined
        : Number(requirement.maxCarpetArea);
    if (carpet !== undefined && minCarpet !== undefined && carpet < minCarpet) return null;
    if (carpet !== undefined && maxCarpet !== undefined && carpet > maxCarpet) return null;
    if ((minCarpet !== undefined || maxCarpet !== undefined) && carpet === undefined) return null;

    const missingAmenities = requirement.mustHaveAmenities.filter(
      (value) => !unitAmenities.has(lower(value)),
    );
    if (missingAmenities.length) return null;

    let score = 50;
    const reasons: string[] = ['Available inventory'];

    if (requiredLocalities.length && locality) {
      score += 15;
      reasons.push('Preferred locality');
    } else if (requiredCities.length && city) {
      score += 8;
      reasons.push('Preferred city');
    }
    if (requiredTypes.length) {
      score += 10;
      reasons.push('Property type');
    }
    if (requiredConfigs.length) {
      score += 10;
      reasons.push('Configuration');
    }
    if (price !== undefined && (minBudget !== undefined || maxBudget !== undefined)) {
      score += 8;
      reasons.push('Within budget');
    }
    if (carpet !== undefined && (minCarpet !== undefined || maxCarpet !== undefined)) {
      score += 4;
      reasons.push('Carpet area');
    }
    if (requirement.mustHaveAmenities.length) {
      score += 3;
      reasons.push('Required amenities');
    }

    return {
      unit,
      project,
      score: Math.min(score, 100),
      reasons,
    };
  }

  private async assertEnabled(principal: Principal) {
    if (principal.isPlatformAdmin) return;
    if (
      !(await this.entitlements.can(
        principal.organizationId,
        'extension.realestate',
      ))
    ) {
      throw new ForbiddenException('Real Estate extension is not enabled.');
    }
  }

  private async resolveWorkspace(principal: Principal, workspaceId?: string) {
    const rows = await this.database.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(
        workspaceId
          ? and(
              eq(workspaces.organizationId, principal.organizationId),
              eq(workspaces.id, workspaceId),
            )
          : eq(workspaces.organizationId, principal.organizationId),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Workspace not found.');
    return rows[0].id;
  }

  private async resolveMember(principal: Principal, memberId: string) {
    const rows = await this.database.db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, principal.organizationId),
          eq(organizationMembers.id, memberId),
          eq(organizationMembers.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Organization member not found.');
    return rows[0].id;
  }

  private async assertCrmRecord(
    table: typeof contacts | typeof leads | typeof deals,
    organizationId: string,
    id: string,
    label: string,
  ) {
    const rows = await this.database.db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.organizationId, organizationId), eq(table.id, id)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException(`${label} not found.`);
  }

  private async assertOwned<
    T extends
      | typeof realEstateDevelopers
      | typeof realEstateProjects
      | typeof realEstateBuildings
      | typeof realEstatePropertyOwners
      | typeof realEstateBrokers
      | typeof realEstateUnits
      | typeof realEstateRequirements
      | typeof realEstateSiteVisits
      | typeof realEstateOffers
      | typeof realEstateBookings,
  >(table: T, organizationId: string, id: string, label: string) {
    const queryTable = table as unknown as typeof realEstateUnits;
    const rows = await this.database.db
      .select()
      .from(queryTable)
      .where(
        and(
          eq(queryTable.organizationId, organizationId),
          eq(queryTable.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException(`${label} not found.`);
    return rows[0] as unknown as T['$inferSelect'];
  }

  private validateRange(min?: string, max?: string, label = 'range') {
    if (min !== undefined && max !== undefined && Number(min) > Number(max)) {
      throw new BadRequestException(`Minimum ${label} cannot exceed maximum.`);
    }
  }

  private filterSearch<T extends Record<string, unknown>>(
    rows: T[],
    search: string | undefined,
    fields: (keyof T)[],
  ) {
    if (!search) return rows;
    const needle = search.toLowerCase();
    return rows.filter((row) =>
      fields.some((field) => String(row[field] ?? '').toLowerCase().includes(needle)),
    );
  }

  private async audit(
    tx: Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0],
    principal: Principal,
    workspaceId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    after: Record<string, unknown>,
    before?: Record<string, unknown>,
  ) {
    await tx.insert(auditLogs).values({
      organizationId: principal.organizationId,
      workspaceId,
      actorType: principal.actorType ?? 'USER',
      actorId: principal.actorId ?? principal.userId,
      action,
      resourceType,
      resourceId,
      before,
      after,
    });
  }
}
