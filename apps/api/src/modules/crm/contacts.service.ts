import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  auditLogs,
  outboxEvents,
} from '../../platform/database/schema.js';
import {
  companies,
  contactCompanies,
  contacts,
} from './crm.schema.js';
import { CrmProvisioningService } from './crm-provisioning.service.js';
import type {
  CreateCompanyDto,
  CreateContactDto,
  LinkContactCompanyDto,
  ListQueryDto,
  UpdateCompanyDto,
  UpdateContactDto,
} from './dto/crm.dto.js';

@Injectable()
export class ContactsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly provisioning: CrmProvisioningService,
  ) {}

  async listContacts(principal: Principal, query: ListQueryDto) {
    const search = query.search?.trim();
    const filter = search
      ? and(
          eq(contacts.organizationId, principal.organizationId),
          or(
            ilike(contacts.displayName, `%${search}%`),
            ilike(contacts.email, `%${search}%`),
            ilike(contacts.phone, `%${search}%`),
          ),
        )
      : eq(contacts.organizationId, principal.organizationId);

    return this.database.db
      .select()
      .from(contacts)
      .where(filter)
      .orderBy(desc(contacts.createdAt))
      .limit(query.limit);
  }

  async getContact(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, principal.organizationId),
          eq(contacts.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Contact not found.');
    return rows[0];
  }
  async createContact(principal: Principal, dto: CreateContactDto) {
    const workspaceId = await this.provisioning.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    const ownerMemberId = await this.provisioning.assertMember(
      principal.organizationId,
      dto.ownerMemberId ?? principal.membershipId,
    );

    return this.database.db.transaction(async (tx) => {
      const [contact] = await tx
        .insert(contacts)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          ownerMemberId,
          displayName: dto.displayName.trim(),
          firstName: dto.firstName?.trim(),
          lastName: dto.lastName?.trim(),
          email: dto.email?.trim().toLowerCase(),
          phone: dto.phone?.trim(),
          source: dto.source?.trim(),
        })
        .returning();

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'crm.contact.created.v1',
        aggregateType: 'contact',
        aggregateId: contact.id,
        payload: {
          contactId: contact.id,
          workspaceId,
          ownerMemberId,
          source: contact.source,
        },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'crm.contact.create',
        resourceType: 'contact',
        resourceId: contact.id,
        after: contact,
      });
      return contact;
    });
  }

  async updateContact(
    principal: Principal,
    id: string,
    dto: UpdateContactDto,
  ) {
    const before = await this.getContact(principal, id);
    const ownerMemberId =
      dto.ownerMemberId === undefined
        ? before.ownerMemberId
        : await this.provisioning.assertMember(
            principal.organizationId,
            dto.ownerMemberId,
          );

    return this.database.db.transaction(async (tx) => {
      const [contact] = await tx
        .update(contacts)
        .set({
          ownerMemberId,
          displayName: dto.displayName?.trim(),
          firstName: dto.firstName?.trim(),
          lastName: dto.lastName?.trim(),
          email: dto.email?.trim().toLowerCase(),
          phone: dto.phone?.trim(),
          source: dto.source?.trim(),
          lifecycleStage: dto.lifecycleStage,
          status: dto.status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(contacts.organizationId, principal.organizationId),
            eq(contacts.id, id),
          ),
        )
        .returning();

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'crm.contact.updated.v1',
        aggregateType: 'contact',
        aggregateId: contact.id,
        payload: { contactId: contact.id },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: contact.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'crm.contact.update',
        resourceType: 'contact',
        resourceId: contact.id,
        before,
        after: contact,
      });
      return contact;
    });
  }

  async listCompanies(principal: Principal, query: ListQueryDto) {
    const search = query.search?.trim();
    const filter = search
      ? and(
          eq(companies.organizationId, principal.organizationId),
          or(
            ilike(companies.name, `%${search}%`),
            ilike(companies.domain, `%${search}%`),
          ),
        )
      : eq(companies.organizationId, principal.organizationId);

    return this.database.db
      .select()
      .from(companies)
      .where(filter)
      .orderBy(desc(companies.createdAt))
      .limit(query.limit);
  }

  async getCompany(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(companies)
      .where(
        and(
          eq(companies.organizationId, principal.organizationId),
          eq(companies.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Company not found.');
    return rows[0];
  }

  async createCompany(principal: Principal, dto: CreateCompanyDto) {
    const workspaceId = await this.provisioning.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    const ownerMemberId = await this.provisioning.assertMember(
      principal.organizationId,
      dto.ownerMemberId ?? principal.membershipId,
    );

    return this.database.db.transaction(async (tx) => {
      const [company] = await tx
        .insert(companies)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          ownerMemberId,
          name: dto.name.trim(),
          domain: dto.domain?.trim().toLowerCase(),
          website: dto.website?.trim(),
          phone: dto.phone?.trim(),
          industry: dto.industry?.trim(),
        })
        .returning();

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'crm.company.created.v1',
        aggregateType: 'company',
        aggregateId: company.id,
        payload: { companyId: company.id, workspaceId },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'crm.company.create',
        resourceType: 'company',
        resourceId: company.id,
        after: company,
      });
      return company;
    });
  }

  async updateCompany(
    principal: Principal,
    id: string,
    dto: UpdateCompanyDto,
  ) {
    const before = await this.getCompany(principal, id);
    const ownerMemberId =
      dto.ownerMemberId === undefined
        ? before.ownerMemberId
        : await this.provisioning.assertMember(
            principal.organizationId,
            dto.ownerMemberId,
          );

    return this.database.db.transaction(async (tx) => {
      const [company] = await tx
        .update(companies)
        .set({
          ownerMemberId,
          name: dto.name?.trim(),
          domain: dto.domain?.trim().toLowerCase(),
          website: dto.website?.trim(),
          phone: dto.phone?.trim(),
          industry: dto.industry?.trim(),
          status: dto.status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(companies.organizationId, principal.organizationId),
            eq(companies.id, id),
          ),
        )
        .returning();

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'crm.company.updated.v1',
        aggregateType: 'company',
        aggregateId: company.id,
        payload: { companyId: company.id },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: company.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'crm.company.update',
        resourceType: 'company',
        resourceId: company.id,
        before,
        after: company,
      });
      return company;
    });
  }

  async listContactCompanies(principal: Principal, contactId: string) {
    await this.getContact(principal, contactId);
    return this.database.db
      .select({
        id: contactCompanies.id,
        companyId: companies.id,
        companyName: companies.name,
        relationship: contactCompanies.relationship,
        isPrimary: contactCompanies.isPrimary,
      })
      .from(contactCompanies)
      .innerJoin(companies, eq(companies.id, contactCompanies.companyId))
      .where(
        and(
          eq(contactCompanies.organizationId, principal.organizationId),
          eq(contactCompanies.contactId, contactId),
          eq(companies.organizationId, principal.organizationId),
        ),
      )
      .orderBy(desc(contactCompanies.createdAt));
  }

  async linkContactCompany(
    principal: Principal,
    contactId: string,
    dto: LinkContactCompanyDto,
  ) {
    const [contact, company] = await Promise.all([
      this.getContact(principal, contactId),
      this.getCompany(principal, dto.companyId),
    ]);

    return this.database.db.transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx
          .update(contactCompanies)
          .set({ isPrimary: false })
          .where(
            and(
              eq(contactCompanies.organizationId, principal.organizationId),
              eq(contactCompanies.contactId, contactId),
            ),
          );
      }

      const [link] = await tx
        .insert(contactCompanies)
        .values({
          organizationId: principal.organizationId,
          contactId,
          companyId: company.id,
          relationship: dto.relationship?.trim(),
          isPrimary: dto.isPrimary ?? false,
        })
        .onConflictDoUpdate({
          target: [
            contactCompanies.organizationId,
            contactCompanies.contactId,
            contactCompanies.companyId,
          ],
          set: {
            relationship: dto.relationship?.trim(),
            isPrimary: dto.isPrimary ?? false,
          },
        })
        .returning();

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'crm.contact_company.linked.v1',
        aggregateType: 'contact',
        aggregateId: contactId,
        payload: {
          contactId,
          companyId: company.id,
          relationship: link.relationship,
          isPrimary: link.isPrimary,
        },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: contact.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'crm.contact_company.link',
        resourceType: 'contact',
        resourceId: contactId,
        metadata: { companyId: company.id },
      });
      return link;
    });
  }
}
