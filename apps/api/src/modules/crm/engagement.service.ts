import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import { auditLogs, outboxEvents } from '../../platform/database/schema.js';
import {
  activities,
  appointments,
  notes,
  tasks,
} from './crm.schema.js';
import { CrmProvisioningService } from './crm-provisioning.service.js';
import { CrmReferenceService } from './crm-reference.service.js';
import type {
  CreateActivityDto,
  CreateAppointmentDto,
  CreateNoteDto,
  CreateTaskDto,
  ListQueryDto,
  UpdateAppointmentDto,
  UpdateTaskDto,
} from './dto/crm.dto.js';

@Injectable()
export class EngagementService {
  constructor(
    private readonly database: DatabaseService,
    private readonly provisioning: CrmProvisioningService,
    private readonly references: CrmReferenceService,
  ) {}

  async listTasks(principal: Principal, query: ListQueryDto) {
    return this.database.db
      .select()
      .from(tasks)
      .where(eq(tasks.organizationId, principal.organizationId))
      .orderBy(desc(tasks.createdAt))
      .limit(query.limit);
  }

  async getTask(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, principal.organizationId),
          eq(tasks.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Task not found.');
    return rows[0];
  }

  async createTask(principal: Principal, dto: CreateTaskDto) {
    const workspaceId = await this.provisioning.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    const ownerMemberId = await this.provisioning.assertMember(
      principal.organizationId,
      dto.ownerMemberId ?? principal.membershipId,
    );
    const [contactId, leadId, dealId] = await Promise.all([
      this.references.contact(principal.organizationId, dto.contactId),
      this.references.lead(principal.organizationId, dto.leadId),
      this.references.deal(principal.organizationId, dto.dealId),
    ]);

    return this.database.db.transaction(async (tx) => {
      const [task] = await tx
        .insert(tasks)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          ownerMemberId,
          contactId,
          leadId,
          dealId,
          title: dto.title.trim(),
          description: dto.description?.trim(),
          priority: dto.priority ?? 'NORMAL',
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'crm.task.created.v1',
        aggregateType: 'task',
        aggregateId: task.id,
        payload: { taskId: task.id, ownerMemberId, dueAt: task.dueAt },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId,
        actorType: principal.actorType ?? 'USER',
        actorId: principal.actorId ?? principal.userId,
        action: 'crm.task.create',
        resourceType: 'task',
        resourceId: task.id,
        after: task,
      });
      return task;
    });
  }

  async updateTask(principal: Principal, id: string, dto: UpdateTaskDto) {
    const before = await this.getTask(principal, id);
    const ownerMemberId =
      dto.ownerMemberId === undefined
        ? before.ownerMemberId
        : await this.provisioning.assertMember(
            principal.organizationId,
            dto.ownerMemberId,
          );
    const completedAt =
      dto.status === 'DONE'
        ? before.completedAt ?? new Date()
        : dto.status && dto.status !== 'DONE'
          ? null
          : undefined;

    return this.database.db.transaction(async (tx) => {
      const [task] = await tx
        .update(tasks)
        .set({
          ownerMemberId,
          title: dto.title?.trim(),
          description: dto.description?.trim(),
          status: dto.status,
          priority: dto.priority,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
          completedAt,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tasks.organizationId, principal.organizationId),
            eq(tasks.id, id),
          ),
        )
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'crm.task.updated.v1',
        aggregateType: 'task',
        aggregateId: task.id,
        payload: { taskId: task.id, status: task.status },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: task.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'crm.task.update',
        resourceType: 'task',
        resourceId: task.id,
        before,
        after: task,
      });
      return task;
    });
  }

  async listAppointments(principal: Principal, query: ListQueryDto) {
    return this.database.db
      .select()
      .from(appointments)
      .where(eq(appointments.organizationId, principal.organizationId))
      .orderBy(desc(appointments.startsAt))
      .limit(query.limit);
  }

  async getAppointment(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.organizationId, principal.organizationId),
          eq(appointments.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Appointment not found.');
    return rows[0];
  }

  async createAppointment(principal: Principal, dto: CreateAppointmentDto) {
    const workspaceId = await this.provisioning.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    const ownerMemberId = await this.provisioning.assertMember(
      principal.organizationId,
      dto.ownerMemberId ?? principal.membershipId,
    );
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException('Appointment end must be after start.');
    }
    const [contactId, leadId, dealId] = await Promise.all([
      this.references.contact(principal.organizationId, dto.contactId),
      this.references.lead(principal.organizationId, dto.leadId),
      this.references.deal(principal.organizationId, dto.dealId),
    ]);

    return this.database.db.transaction(async (tx) => {
      const [appointment] = await tx
        .insert(appointments)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          ownerMemberId,
          contactId,
          leadId,
          dealId,
          title: dto.title.trim(),
          startsAt,
          endsAt,
          timezone: dto.timezone ?? 'Asia/Kolkata',
          location: dto.location?.trim(),
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
        },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'crm.appointment.create',
        resourceType: 'appointment',
        resourceId: appointment.id,
        after: appointment,
      });
      return appointment;
    });
  }

  async updateAppointment(
    principal: Principal,
    id: string,
    dto: UpdateAppointmentDto,
  ) {
    const before = await this.getAppointment(principal, id);
    const ownerMemberId =
      dto.ownerMemberId === undefined
        ? before.ownerMemberId
        : await this.provisioning.assertMember(
            principal.organizationId,
            dto.ownerMemberId,
          );
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : before.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : before.endsAt;
    if (endsAt <= startsAt) {
      throw new BadRequestException('Appointment end must be after start.');
    }

    return this.database.db.transaction(async (tx) => {
      const [appointment] = await tx
        .update(appointments)
        .set({
          ownerMemberId,
          title: dto.title?.trim(),
          status: dto.status,
          startsAt,
          endsAt,
          timezone: dto.timezone,
          location: dto.location?.trim(),
          notes: dto.notes?.trim(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(appointments.organizationId, principal.organizationId),
            eq(appointments.id, id),
          ),
        )
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'crm.appointment.updated.v1',
        aggregateType: 'appointment',
        aggregateId: appointment.id,
        payload: {
          appointmentId: appointment.id,
          status: appointment.status,
          startsAt: appointment.startsAt,
        },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: appointment.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'crm.appointment.update',
        resourceType: 'appointment',
        resourceId: appointment.id,
        before,
        after: appointment,
      });
      return appointment;
    });
  }

  listActivities(principal: Principal, limit = 50) {
    return this.database.db
      .select()
      .from(activities)
      .where(eq(activities.organizationId, principal.organizationId))
      .orderBy(desc(activities.occurredAt))
      .limit(Math.min(Math.max(limit, 1), 100));
  }

  async createActivity(principal: Principal, dto: CreateActivityDto) {
    const workspaceId = await this.provisioning.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    const [contactId, companyId, leadId, dealId] = await Promise.all([
      this.references.contact(principal.organizationId, dto.contactId),
      this.references.company(principal.organizationId, dto.companyId),
      this.references.lead(principal.organizationId, dto.leadId),
      this.references.deal(principal.organizationId, dto.dealId),
    ]);

    return this.database.db.transaction(async (tx) => {
      const [activity] = await tx
        .insert(activities)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          actorMemberId: principal.membershipId,
          contactId,
          companyId,
          leadId,
          dealId,
          type: dto.type,
          direction: dto.direction,
          subject: dto.subject?.trim(),
          body: dto.body?.trim(),
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
          metadata: dto.metadata,
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'crm.activity.created.v1',
        aggregateType: 'activity',
        aggregateId: activity.id,
        payload: { activityId: activity.id, type: activity.type, leadId, dealId },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'crm.activity.create',
        resourceType: 'activity',
        resourceId: activity.id,
        after: activity,
      });
      return activity;
    });
  }

  listNotes(principal: Principal, objectType: string, objectId: string) {
    return this.database.db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.organizationId, principal.organizationId),
          eq(notes.objectType, objectType),
          eq(notes.objectId, objectId),
        ),
      )
      .orderBy(desc(notes.createdAt))
      .limit(100);
  }

  async createNote(principal: Principal, dto: CreateNoteDto) {
    const workspaceId = await this.provisioning.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    if (dto.objectType === 'CONTACT') {
      await this.references.contact(principal.organizationId, dto.objectId);
    } else if (dto.objectType === 'COMPANY') {
      await this.references.company(principal.organizationId, dto.objectId);
    } else if (dto.objectType === 'LEAD') {
      await this.references.lead(principal.organizationId, dto.objectId);
    } else {
      await this.references.deal(principal.organizationId, dto.objectId);
    }

    return this.database.db.transaction(async (tx) => {
      const [note] = await tx
        .insert(notes)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          authorMemberId: principal.membershipId,
          objectType: dto.objectType,
          objectId: dto.objectId,
          body: dto.body.trim(),
        })
        .returning();
      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'crm.note.created.v1',
        aggregateType: 'note',
        aggregateId: note.id,
        payload: {
          noteId: note.id,
          objectType: note.objectType,
          objectId: note.objectId,
        },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'crm.note.create',
        resourceType: 'note',
        resourceId: note.id,
        after: note,
      });
      return note;
    });
  }
}
