import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
} from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Principal } from '../../platform/auth/auth.types.js';
import { AuditService } from '../../platform/audit/audit.service.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  organizationMembers,
  organizations,
  outboxEvents,
} from '../../platform/database/schema.js';
import { aiAgents } from '../ai/ai.schema.js';
import { automationWorkflows } from '../automation/automation.schema.js';
import { channelAccounts, conversations } from '../communication/communication.schema.js';
import { companies, contacts, deals, leads } from '../crm/crm.schema.js';
import { CrmScopeService } from '../crm/crm-scope.service.js';
import { saasCustomerBillingProfiles } from '../saas-commercial/saas-commercial.schema.js';
import type {
  CreateGovernanceRequestDto,
  CreateSupportTicketDto,
  ProviderUpdateSupportTicketDto,
  ReviewGovernanceRequestDto,
  UpdateSupportTicketDto,
  UpsertGovernancePolicyDto,
} from './platform-experience.dto.js';
import {
  dataGovernancePolicies,
  dataGovernanceRequests,
  supportTicketComments,
  supportTickets,
  tenantNotifications,
  tenantOnboardingStates,
} from './platform-experience.schema.js';

type NotificationInput = {
  organizationId: string;
  membershipId?: string | null;
  category: string;
  severity?: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
  title: string;
  body: string;
  actionHref?: string;
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class PlatformExperienceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly crmScope: CrmScopeService,
  ) {}

  async search(principal: Principal, query: string, limit = 12) {
    const q = query.trim();
    const safeLimit = Math.min(Math.max(limit, 1), 40);
    const scanLimit = Math.min(safeLimit * 3, 80);
    const needle = '%' + q + '%';
    const scope = await this.crmScope.resolve(principal);

    const [contactRows, companyRows, leadRows, dealRows] = await Promise.all([
      this.database.db
        .select({
          id: contacts.id,
          title: contacts.displayName,
          email: contacts.email,
          phone: contacts.phone,
          ownerMemberId: contacts.ownerMemberId,
          workspaceId: contacts.workspaceId,
          updatedAt: contacts.updatedAt,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.organizationId, principal.organizationId),
            or(
              ilike(contacts.displayName, needle),
              ilike(contacts.email, needle),
              ilike(contacts.phone, needle),
            ),
          ),
        )
        .orderBy(desc(contacts.updatedAt))
        .limit(scanLimit),
      this.database.db
        .select({
          id: companies.id,
          title: companies.name,
          domain: companies.domain,
          industry: companies.industry,
          ownerMemberId: companies.ownerMemberId,
          workspaceId: companies.workspaceId,
          updatedAt: companies.updatedAt,
        })
        .from(companies)
        .where(
          and(
            eq(companies.organizationId, principal.organizationId),
            or(
              ilike(companies.name, needle),
              ilike(companies.domain, needle),
              ilike(companies.industry, needle),
            ),
          ),
        )
        .orderBy(desc(companies.updatedAt))
        .limit(scanLimit),
      this.database.db
        .select({
          id: leads.id,
          title: leads.title,
          status: leads.status,
          temperature: leads.temperature,
          ownerMemberId: leads.ownerMemberId,
          workspaceId: leads.workspaceId,
          updatedAt: leads.updatedAt,
        })
        .from(leads)
        .where(
          and(
            eq(leads.organizationId, principal.organizationId),
            or(
              ilike(leads.title, needle),
              ilike(leads.status, needle),
              ilike(leads.temperature, needle),
            ),
          ),
        )
        .orderBy(desc(leads.updatedAt))
        .limit(scanLimit),
      this.database.db
        .select({
          id: deals.id,
          title: deals.name,
          status: deals.status,
          amount: deals.amount,
          currency: deals.currency,
          ownerMemberId: deals.ownerMemberId,
          workspaceId: deals.workspaceId,
          updatedAt: deals.updatedAt,
        })
        .from(deals)
        .where(
          and(
            eq(deals.organizationId, principal.organizationId),
            or(ilike(deals.name, needle), ilike(deals.status, needle)),
          ),
        )
        .orderBy(desc(deals.updatedAt))
        .limit(scanLimit),
    ]);

    const results = [
      ...contactRows
        .filter((row) => this.crmScope.canReadRow(scope, row))
        .map((row) => ({
          type: 'CONTACT',
          id: row.id,
          title: row.title,
          subtitle: [row.email, row.phone].filter(Boolean).join(' · '),
          href: '/crm?tab=contacts&focus=' + row.id,
          updatedAt: row.updatedAt,
        })),
      ...companyRows
        .filter((row) => this.crmScope.canReadRow(scope, row))
        .map((row) => ({
          type: 'COMPANY',
          id: row.id,
          title: row.title,
          subtitle: [row.domain, row.industry].filter(Boolean).join(' · '),
          href: '/crm?tab=companies&focus=' + row.id,
          updatedAt: row.updatedAt,
        })),
      ...leadRows
        .filter((row) => this.crmScope.canReadRow(scope, row))
        .map((row) => ({
          type: 'LEAD',
          id: row.id,
          title: row.title,
          subtitle: [row.temperature, row.status].filter(Boolean).join(' · '),
          href: '/crm?tab=leads&focus=' + row.id,
          updatedAt: row.updatedAt,
        })),
      ...dealRows
        .filter((row) => this.crmScope.canReadRow(scope, row))
        .map((row) => ({
          type: 'DEAL',
          id: row.id,
          title: row.title,
          subtitle:
            row.amount === null
              ? row.status
              : row.status + ' · ' + row.currency + ' ' + row.amount,
          href: '/crm?tab=deals&focus=' + row.id,
          updatedAt: row.updatedAt,
        })),
    ]
      .sort(
        (left, right) =>
          right.updatedAt.getTime() - left.updatedAt.getTime(),
      )
      .slice(0, safeLimit)
      .map(({ updatedAt: _updatedAt, ...row }) => row);

    return { query: q, results };
  }

  async onboarding(principal: Principal) {
    const state = await this.ensureOnboardingState(principal.organizationId);
    const [
      memberCount,
      contactCount,
      channelCount,
      aiCount,
      workflowCount,
      billingCount,
    ] = await Promise.all([
      this.countRows(organizationMembers, principal.organizationId),
      this.countRows(contacts, principal.organizationId),
      this.countRows(channelAccounts, principal.organizationId, 'CONNECTED'),
      this.countRows(aiAgents, principal.organizationId, 'ACTIVE'),
      this.countRows(automationWorkflows, principal.organizationId, 'ACTIVE'),
      this.countRows(saasCustomerBillingProfiles, principal.organizationId),
    ]);

    const steps = [
      {
        key: 'workspace',
        title: 'Workspace created',
        description: 'Your tenant, workspace and owner access are active.',
        done: true,
        href: '/dashboard',
      },
      {
        key: 'team',
        title: 'Invite your team',
        description: 'Add at least one additional teammate and assign role/scope.',
        done: memberCount > 1,
        href: '/team',
      },
      {
        key: 'crm',
        title: 'Start your CRM',
        description: 'Create or import your first customer contact.',
        done: contactCount > 0,
        href: '/crm',
      },
      {
        key: 'billing',
        title: 'Add billing identity',
        description: 'Configure your SaaS billing profile and subscription context.',
        done: billingCount > 0,
        href: '/subscription',
      },
      {
        key: 'whatsapp',
        title: 'Connect WhatsApp',
        description: 'Connect a WhatsApp business channel when provider activation is ready.',
        done: channelCount > 0,
        href: '/whatsapp',
        optional: true,
      },
      {
        key: 'ai',
        title: 'Configure an AI agent',
        description: 'Create and activate a governed AI agent.',
        done: aiCount > 0,
        href: '/ai-agents',
        optional: true,
      },
      {
        key: 'automation',
        title: 'Create an automation',
        description: 'Activate a durable workflow for a repeatable business process.',
        done: workflowCount > 0,
        href: '/automations',
        optional: true,
      },
    ];

    const required = steps.filter((step) => !step.optional);
    const completed = required.every((step) => step.done);
    if (completed && !state.completedAt) {
      await this.database.db
        .update(tenantOnboardingStates)
        .set({ completedAt: new Date(), updatedAt: new Date() })
        .where(eq(tenantOnboardingStates.id, state.id));
    }
    await this.database.db
      .update(tenantOnboardingStates)
      .set({ lastViewedAt: new Date(), updatedAt: new Date() })
      .where(eq(tenantOnboardingStates.id, state.id));

    return {
      dismissed: Boolean(state.dismissedAt),
      completed: completed || Boolean(state.completedAt),
      progress: {
        complete: steps.filter((step) => step.done).length,
        total: steps.length,
        requiredComplete: required.filter((step) => step.done).length,
        requiredTotal: required.length,
      },
      steps,
    };
  }

  async setOnboardingDismissed(principal: Principal, dismissed: boolean) {
    const state = await this.ensureOnboardingState(principal.organizationId);
    const [updated] = await this.database.db
      .update(tenantOnboardingStates)
      .set({
        dismissedAt: dismissed ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(tenantOnboardingStates.id, state.id))
      .returning();
    await this.audit.record({
      organizationId: principal.organizationId,
      actorType: principal.actorType ?? 'USER',
      actorId: principal.actorId ?? principal.userId,
      action: dismissed ? 'onboarding.dismiss' : 'onboarding.reopen',
      resourceType: 'tenant_onboarding',
      resourceId: state.id,
    });
    return updated;
  }

  async listNotifications(principal: Principal, limit = 60) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const rows = await this.database.db
      .select()
      .from(tenantNotifications)
      .where(
        and(
          eq(tenantNotifications.organizationId, principal.organizationId),
          or(
            isNull(tenantNotifications.membershipId),
            eq(tenantNotifications.membershipId, principal.membershipId),
          ),
          inArray(tenantNotifications.status, ['UNREAD', 'READ']),
        ),
      )
      .orderBy(desc(tenantNotifications.createdAt))
      .limit(safeLimit);
    return {
      unreadCount: rows.filter((row) => row.status === 'UNREAD').length,
      notifications: rows,
    };
  }

  async markNotificationRead(principal: Principal, id: string) {
    const [row] = await this.database.db
      .select()
      .from(tenantNotifications)
      .where(
        and(
          eq(tenantNotifications.id, id),
          eq(tenantNotifications.organizationId, principal.organizationId),
          or(
            isNull(tenantNotifications.membershipId),
            eq(tenantNotifications.membershipId, principal.membershipId),
          ),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException('Notification not found.');
    if (row.status === 'READ') return row;
    const [updated] = await this.database.db
      .update(tenantNotifications)
      .set({ status: 'READ', readAt: new Date(), updatedAt: new Date() })
      .where(eq(tenantNotifications.id, id))
      .returning();
    return updated;
  }

  async markAllNotificationsRead(principal: Principal) {
    const rows = await this.database.db
      .update(tenantNotifications)
      .set({ status: 'READ', readAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(tenantNotifications.organizationId, principal.organizationId),
          eq(tenantNotifications.status, 'UNREAD'),
          or(
            isNull(tenantNotifications.membershipId),
            eq(tenantNotifications.membershipId, principal.membershipId),
          ),
        ),
      )
      .returning({ id: tenantNotifications.id });
    return { updated: rows.length };
  }

  async notify(input: NotificationInput) {
    const values = {
      organizationId: input.organizationId,
      membershipId: input.membershipId ?? null,
      category: input.category,
      severity: input.severity ?? 'INFO',
      title: input.title,
      body: input.body,
      actionHref: input.actionHref,
      dedupeKey: input.dedupeKey,
      metadata: input.metadata,
    };
    if (input.dedupeKey) {
      const inserted = await this.database.db
        .insert(tenantNotifications)
        .values(values)
        .onConflictDoNothing()
        .returning();
      return inserted[0] ?? null;
    }
    const [row] = await this.database.db
      .insert(tenantNotifications)
      .values(values)
      .returning();
    return row;
  }

  async listSupportTickets(principal: Principal) {
    return this.database.db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.organizationId, principal.organizationId))
      .orderBy(desc(supportTickets.lastActivityAt));
  }

  async createSupportTicket(
    principal: Principal,
    dto: CreateSupportTicketDto,
  ) {
    const ticketNumber =
      'SUP-' +
      Date.now().toString(36).toUpperCase() +
      '-' +
      randomUUID().slice(0, 4).toUpperCase();
    const [ticket] = await this.database.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(supportTickets)
        .values({
          organizationId: principal.organizationId,
          createdByMemberId: principal.membershipId,
          ticketNumber,
          category: dto.category,
          priority: dto.priority ?? 'NORMAL',
          subject: dto.subject.trim(),
          description: dto.description.trim(),
          relatedResourceType: dto.relatedResourceType,
          relatedResourceId: dto.relatedResourceId,
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'support.ticket.created.v1',
        aggregateType: 'support_ticket',
        aggregateId: created.id,
        payload: {
          ticketId: created.id,
          ticketNumber: created.ticketNumber,
          category: created.category,
          priority: created.priority,
        },
      });
      return [created];
    });
    await this.audit.record({
      organizationId: principal.organizationId,
      actorType: principal.actorType ?? 'USER',
      actorId: principal.actorId ?? principal.userId,
      action: 'support.ticket.create',
      resourceType: 'support_ticket',
      resourceId: ticket.id,
      after: {
        ticketNumber: ticket.ticketNumber,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
      },
    });
    return ticket;
  }

  async supportTicket(principal: Principal, id: string) {
    const ticket = await this.tenantTicket(principal.organizationId, id);
    const comments = await this.database.db
      .select()
      .from(supportTicketComments)
      .where(
        and(
          eq(supportTicketComments.ticketId, id),
          eq(supportTicketComments.isInternal, false),
        ),
      )
      .orderBy(supportTicketComments.createdAt);
    return { ticket, comments };
  }

  async addSupportComment(
    principal: Principal,
    ticketId: string,
    body: string,
  ) {
    const ticket = await this.tenantTicket(principal.organizationId, ticketId);
    if (ticket.status === 'CLOSED') {
      throw new ConflictException('Closed tickets cannot receive new comments.');
    }
    const [comment] = await this.database.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(supportTicketComments)
        .values({
          organizationId: principal.organizationId,
          ticketId,
          authorType: 'USER',
          authorId: principal.userId,
          body: body.trim(),
        })
        .returning();
      await tx
        .update(supportTickets)
        .set({
          status: 'OPEN',
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, ticketId));
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'support.ticket.customer_replied.v1',
        aggregateType: 'support_ticket',
        aggregateId: ticketId,
        payload: { ticketId, ticketNumber: ticket.ticketNumber },
      });
      return [created];
    });
    return comment;
  }

  async updateSupportTicket(
    principal: Principal,
    id: string,
    dto: UpdateSupportTicketDto,
  ) {
    const before = await this.tenantTicket(principal.organizationId, id);
    const status = dto.status ?? before.status;
    const [updated] = await this.database.db
      .update(supportTickets)
      .set({
        status,
        priority: dto.priority ?? before.priority,
        resolvedAt: status === 'RESOLVED' ? new Date() : before.resolvedAt,
        closedAt: status === 'CLOSED' ? new Date() : before.closedAt,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(supportTickets.id, id))
      .returning();
    await this.audit.record({
      organizationId: principal.organizationId,
      actorType: principal.actorType ?? 'USER',
      actorId: principal.actorId ?? principal.userId,
      action: 'support.ticket.update',
      resourceType: 'support_ticket',
      resourceId: id,
      before: { status: before.status, priority: before.priority },
      after: { status: updated.status, priority: updated.priority },
    });
    return updated;
  }

  async providerTickets(principal: Principal) {
    this.assertPlatformAdmin(principal);
    return this.database.db
      .select()
      .from(supportTickets)
      .orderBy(desc(supportTickets.lastActivityAt))
      .limit(250);
  }

  async providerSupportTicket(principal: Principal, id: string) {
    this.assertPlatformAdmin(principal);
    const [ticket] = await this.database.db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, id))
      .limit(1);
    if (!ticket) throw new NotFoundException('Support ticket not found.');
    const comments = await this.database.db
      .select()
      .from(supportTicketComments)
      .where(eq(supportTicketComments.ticketId, id))
      .orderBy(supportTicketComments.createdAt);
    return { ticket, comments };
  }

  async providerAddSupportComment(
    principal: Principal,
    ticketId: string,
    body: string,
    internal = false,
  ) {
    this.assertPlatformAdmin(principal);
    const [ticket] = await this.database.db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);
    if (!ticket) throw new NotFoundException('Support ticket not found.');
    const [comment] = await this.database.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(supportTicketComments)
        .values({
          organizationId: ticket.organizationId,
          ticketId,
          authorType: 'PROVIDER',
          authorId: principal.userId,
          body: body.trim(),
          isInternal: internal,
        })
        .returning();
      await tx
        .update(supportTickets)
        .set({
          status: internal ? ticket.status : 'WAITING_CUSTOMER',
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, ticketId));
      return [created];
    });
    if (!internal) {
      await this.notify({
        organizationId: ticket.organizationId,
        membershipId: ticket.createdByMemberId,
        category: 'SUPPORT',
        severity: 'INFO',
        title: 'Support replied to ' + ticket.ticketNumber,
        body: 'A provider response is available on your support ticket.',
        actionHref: '/support?ticket=' + ticket.id,
        dedupeKey: 'support-reply:' + comment.id,
      });
    }
    return comment;
  }

  async providerUpdateSupportTicket(
    principal: Principal,
    id: string,
    dto: ProviderUpdateSupportTicketDto,
  ) {
    this.assertPlatformAdmin(principal);
    const [before] = await this.database.db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, id))
      .limit(1);
    if (!before) throw new NotFoundException('Support ticket not found.');
    const status = dto.status ?? before.status;
    const [updated] = await this.database.db
      .update(supportTickets)
      .set({
        status,
        priority: dto.priority ?? before.priority,
        assignedProviderUserId:
          dto.assignedProviderUserId ?? before.assignedProviderUserId,
        resolvedAt: status === 'RESOLVED' ? new Date() : before.resolvedAt,
        closedAt: status === 'CLOSED' ? new Date() : before.closedAt,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(supportTickets.id, id))
      .returning();
    await this.notify({
      organizationId: updated.organizationId,
      membershipId: updated.createdByMemberId,
      category: 'SUPPORT',
      severity: status === 'RESOLVED' ? 'SUCCESS' : 'INFO',
      title: updated.ticketNumber + ' · ' + status.replaceAll('_', ' '),
      body: 'Your support ticket status has changed.',
      actionHref: '/support?ticket=' + updated.id,
      dedupeKey: 'support-status:' + updated.id + ':' + status + ':' + updated.updatedAt.toISOString(),
    });
    return updated;
  }

  async governancePolicy(principal: Principal) {
    const existing = await this.database.db
      .select()
      .from(dataGovernancePolicies)
      .where(eq(dataGovernancePolicies.organizationId, principal.organizationId))
      .limit(1);
    if (existing[0]) return existing[0];
    const [created] = await this.database.db
      .insert(dataGovernancePolicies)
      .values({ organizationId: principal.organizationId })
      .returning();
    return created;
  }

  async updateGovernancePolicy(
    principal: Principal,
    dto: UpsertGovernancePolicyDto,
  ) {
    const before = await this.governancePolicy(principal);
    const [updated] = await this.database.db
      .update(dataGovernancePolicies)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(dataGovernancePolicies.id, before.id))
      .returning();
    await this.audit.record({
      organizationId: principal.organizationId,
      actorType: principal.actorType ?? 'USER',
      actorId: principal.actorId ?? principal.userId,
      action: 'governance.policy.update',
      resourceType: 'data_governance_policy',
      resourceId: updated.id,
      before: {
        auditRetentionDays: before.auditRetentionDays,
        notificationRetentionDays: before.notificationRetentionDays,
        supportRetentionDays: before.supportRetentionDays,
        aiTraceRetentionDays: before.aiTraceRetentionDays,
        deletionGraceDays: before.deletionGraceDays,
        legalHold: before.legalHold,
      },
      after: {
        auditRetentionDays: dto.auditRetentionDays,
        notificationRetentionDays: dto.notificationRetentionDays,
        supportRetentionDays: dto.supportRetentionDays,
        aiTraceRetentionDays: dto.aiTraceRetentionDays,
        deletionGraceDays: dto.deletionGraceDays,
        legalHold: dto.legalHold,
      },
    });
    return updated;
  }

  async governanceRequests(principal: Principal) {
    return this.database.db
      .select()
      .from(dataGovernanceRequests)
      .where(eq(dataGovernanceRequests.organizationId, principal.organizationId))
      .orderBy(desc(dataGovernanceRequests.createdAt));
  }

  async createGovernanceRequest(
    principal: Principal,
    dto: CreateGovernanceRequestDto,
  ) {
    const policy = await this.governancePolicy(principal);
    if (dto.requestType === 'ERASURE' && policy.legalHold) {
      throw new ConflictException(
        'Organization erasure cannot be requested while legal hold is active.',
      );
    }
    const manifest =
      dto.requestType === 'EXPORT'
        ? await this.buildGovernanceManifest(principal.organizationId)
        : undefined;
    const [request] = await this.database.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(dataGovernanceRequests)
        .values({
          organizationId: principal.organizationId,
          requestedByMemberId: principal.membershipId,
          requestType: dto.requestType,
          reason: dto.reason,
          manifest,
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType:
          dto.requestType === 'EXPORT'
            ? 'governance.export.requested.v1'
            : 'governance.erasure.requested.v1',
        aggregateType: 'data_governance_request',
        aggregateId: created.id,
        payload: {
          requestId: created.id,
          requestType: created.requestType,
          requestedByMemberId: principal.membershipId,
        },
      });
      return [created];
    });
    await this.audit.record({
      organizationId: principal.organizationId,
      actorType: principal.actorType ?? 'USER',
      actorId: principal.actorId ?? principal.userId,
      action: 'governance.request.create',
      resourceType: 'data_governance_request',
      resourceId: request.id,
      after: {
        requestType: request.requestType,
        status: request.status,
      },
    });
    return request;
  }

  async cancelGovernanceRequest(principal: Principal, id: string) {
    const [request] = await this.database.db
      .select()
      .from(dataGovernanceRequests)
      .where(
        and(
          eq(dataGovernanceRequests.id, id),
          eq(dataGovernanceRequests.organizationId, principal.organizationId),
        ),
      )
      .limit(1);
    if (!request) throw new NotFoundException('Governance request not found.');
    if (!['PENDING_REVIEW', 'APPROVED'].includes(request.status)) {
      throw new ConflictException('Request can no longer be cancelled.');
    }
    const [updated] = await this.database.db
      .update(dataGovernanceRequests)
      .set({ status: 'CANCELLED', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(dataGovernanceRequests.id, id))
      .returning();
    return updated;
  }

  async providerGovernanceRequests(principal: Principal) {
    this.assertPlatformAdmin(principal);
    return this.database.db
      .select()
      .from(dataGovernanceRequests)
      .orderBy(desc(dataGovernanceRequests.createdAt))
      .limit(250);
  }

  async reviewGovernanceRequest(
    principal: Principal,
    id: string,
    dto: ReviewGovernanceRequestDto,
  ) {
    this.assertPlatformAdmin(principal);
    const [request] = await this.database.db
      .select()
      .from(dataGovernanceRequests)
      .where(eq(dataGovernanceRequests.id, id))
      .limit(1);
    if (!request) throw new NotFoundException('Governance request not found.');
    if (request.status !== 'PENDING_REVIEW') {
      throw new ConflictException('Governance request is not pending review.');
    }
    const policyRows = await this.database.db
      .select()
      .from(dataGovernancePolicies)
      .where(eq(dataGovernancePolicies.organizationId, request.organizationId))
      .limit(1);
    const policy = policyRows[0];
    if (request.requestType === 'ERASURE' && policy?.legalHold) {
      throw new ConflictException(
        'Erasure cannot be approved while legal hold is active.',
      );
    }

    const approved = dto.decision === 'APPROVE';
    const scheduledAt =
      approved && request.requestType === 'ERASURE'
        ? new Date(
            Date.now() +
              (policy?.deletionGraceDays ?? 30) * 24 * 60 * 60 * 1000,
          )
        : null;
    const status = approved
      ? request.requestType === 'EXPORT'
        ? 'READY'
        : 'APPROVED'
      : 'REJECTED';

    const [updated] = await this.database.db
      .update(dataGovernanceRequests)
      .set({
        status,
        reviewedByUserId: principal.userId,
        reviewNote: dto.note,
        reviewedAt: new Date(),
        scheduledAt,
        updatedAt: new Date(),
      })
      .where(eq(dataGovernanceRequests.id, id))
      .returning();

    await this.notify({
      organizationId: request.organizationId,
      membershipId: request.requestedByMemberId,
      category: 'GOVERNANCE',
      severity: approved ? 'SUCCESS' : 'WARNING',
      title:
        request.requestType +
        ' request ' +
        (approved ? 'approved' : 'rejected'),
      body:
        request.requestType === 'ERASURE' && approved
          ? 'The request entered the configured deletion grace period.'
          : 'The governance request review has completed.',
      actionHref: '/governance',
      dedupeKey: 'governance-review:' + request.id + ':' + status,
    });
    await this.database.db.insert(outboxEvents).values({
      organizationId: request.organizationId,
      eventType: approved
        ? 'governance.request.approved.v1'
        : 'governance.request.rejected.v1',
      aggregateType: 'data_governance_request',
      aggregateId: request.id,
      payload: {
        requestId: request.id,
        requestType: request.requestType,
        status,
        scheduledAt,
      },
    });
    return updated;
  }

  private async ensureOnboardingState(organizationId: string) {
    const existing = await this.database.db
      .select()
      .from(tenantOnboardingStates)
      .where(eq(tenantOnboardingStates.organizationId, organizationId))
      .limit(1);
    if (existing[0]) return existing[0];
    const inserted = await this.database.db
      .insert(tenantOnboardingStates)
      .values({ organizationId })
      .onConflictDoNothing()
      .returning();
    if (inserted[0]) return inserted[0];
    const [raced] = await this.database.db
      .select()
      .from(tenantOnboardingStates)
      .where(eq(tenantOnboardingStates.organizationId, organizationId))
      .limit(1);
    return raced;
  }

  private async tenantTicket(organizationId: string, id: string) {
    const [ticket] = await this.database.db
      .select()
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.id, id),
          eq(supportTickets.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!ticket) throw new NotFoundException('Support ticket not found.');
    return ticket;
  }

  private async buildGovernanceManifest(organizationId: string) {
    const [
      members,
      contactRows,
      companyRows,
      leadRows,
      dealRows,
      conversationRows,
      aiRows,
      workflowRows,
      ticketRows,
    ] = await Promise.all([
      this.countRows(organizationMembers, organizationId),
      this.countRows(contacts, organizationId),
      this.countRows(companies, organizationId),
      this.countRows(leads, organizationId),
      this.countRows(deals, organizationId),
      this.countRows(conversations, organizationId),
      this.countRows(aiAgents, organizationId),
      this.countRows(automationWorkflows, organizationId),
      this.countRows(supportTickets, organizationId),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      organizationId,
      counts: {
        members,
        contacts: contactRows,
        companies: companyRows,
        leads: leadRows,
        deals: dealRows,
        conversations: conversationRows,
        aiAgents: aiRows,
        automations: workflowRows,
        supportTickets: ticketRows,
      },
      note:
        'Manifest is generated from tenant-owned records. Archive delivery remains governed by the request lifecycle.',
    };
  }

  private async countRows(
    table:
      | typeof organizationMembers
      | typeof contacts
      | typeof companies
      | typeof leads
      | typeof deals
      | typeof conversations
      | typeof channelAccounts
      | typeof aiAgents
      | typeof automationWorkflows
      | typeof saasCustomerBillingProfiles
      | typeof supportTickets,
    organizationId: string,
    status?: string,
  ) {
    const organizationColumn = table.organizationId;
    const statusColumn =
      'status' in table ? (table.status as typeof contacts.status) : undefined;
    const [row] = await this.database.db
      .select({ value: count() })
      .from(table)
      .where(
        status && statusColumn
          ? and(eq(organizationColumn, organizationId), eq(statusColumn, status))
          : eq(organizationColumn, organizationId),
      );
    return Number(row?.value ?? 0);
  }

  private assertPlatformAdmin(principal: Principal) {
    if (!principal.isPlatformAdmin) {
      throw new ForbiddenException('Platform administrator access required.');
    }
  }
}
