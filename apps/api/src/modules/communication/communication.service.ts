import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  auditLogs,
  organizationMembers,
  outboxEvents,
  workspaces,
} from '../../platform/database/schema.js';
import { contacts, leads } from '../crm/crm.schema.js';
import {
  campaignRecipients,
  campaigns,
  channelAccounts,
  communicationConsents,
  conversations,
  messages,
  messageTemplates,
} from './communication.schema.js';
import type {
  CreateCampaignDto,
  CreateChannelAccountDto,
  CreateTemplateDto,
  SendTemplateMessageDto,
  SendTextMessageDto,
  SetConsentDto,
  UpdateConversationDto,
} from './dto/communication.dto.js';
import { MetaTransportService } from './meta-transport.service.js';

@Injectable()
export class CommunicationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly meta: MetaTransportService,
  ) {}

  private async resolveWorkspace(
    organizationId: string,
    requestedId?: string,
  ) {
    const rows = requestedId
      ? await this.database.db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(
            and(
              eq(workspaces.organizationId, organizationId),
              eq(workspaces.id, requestedId),
            ),
          )
          .limit(1)
      : await this.database.db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.organizationId, organizationId))
          .limit(1);
    if (!rows[0]) throw new NotFoundException('Workspace not found.');
    return rows[0].id;
  }

  private async assertMember(
    organizationId: string,
    memberId?: string,
  ) {
    if (!memberId) return undefined;
    const rows = await this.database.db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.id, memberId),
          eq(organizationMembers.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Organization member not found.');
    return memberId;
  }

  listChannels(principal: Principal) {
    return this.database.db
      .select({
        id: channelAccounts.id,
        workspaceId: channelAccounts.workspaceId,
        provider: channelAccounts.provider,
        channelType: channelAccounts.channelType,
        providerAccountId: channelAccounts.providerAccountId,
        providerPhoneNumberId: channelAccounts.providerPhoneNumberId,
        displayName: channelAccounts.displayName,
        displayAddress: channelAccounts.displayAddress,
        status: channelAccounts.status,
        metadata: channelAccounts.metadata,
        createdAt: channelAccounts.createdAt,
      })
      .from(channelAccounts)
      .where(eq(channelAccounts.organizationId, principal.organizationId))
      .orderBy(desc(channelAccounts.createdAt));
  }

  async createChannel(
    principal: Principal,
    dto: CreateChannelAccountDto,
  ) {
    const workspaceId = await this.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    const mode = this.config.get<string>('META_TRANSPORT_MODE') ?? 'disabled';

    return this.database.db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: channelAccounts.id, organizationId: channelAccounts.organizationId })
        .from(channelAccounts)
        .where(
          and(
            eq(channelAccounts.provider, 'META'),
            eq(
              channelAccounts.providerPhoneNumberId,
              dto.providerPhoneNumberId,
            ),
          ),
        )
        .limit(1);

      if (
        existing[0] &&
        existing[0].organizationId !== principal.organizationId
      ) {
        throw new ConflictException(
          'This Meta phone number is already linked to another tenant.',
        );
      }

      const [channel] = await tx
        .insert(channelAccounts)
        .values({
          organizationId: principal.organizationId,
          workspaceId,
          provider: 'META',
          channelType: 'WHATSAPP',
          providerAccountId: dto.providerAccountId,
          providerPhoneNumberId: dto.providerPhoneNumberId,
          displayName: dto.displayName?.trim(),
          displayAddress: dto.displayAddress?.trim(),
          credentialRef: dto.credentialRef.trim(),
          status: mode === 'mock' ? 'CONNECTED' : 'CONFIGURED',
          metadata: dto.metadata,
        })
        .onConflictDoUpdate({
          target: [
            channelAccounts.provider,
            channelAccounts.providerPhoneNumberId,
          ],
          set: {
            providerAccountId: dto.providerAccountId,
            displayName: dto.displayName?.trim(),
            displayAddress: dto.displayAddress?.trim(),
            credentialRef: dto.credentialRef.trim(),
            metadata: dto.metadata,
            updatedAt: new Date(),
          },
        })
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'communication.channel.upsert',
        resourceType: 'channel_account',
        resourceId: channel.id,
        after: {
          ...channel,
          credentialRef: '[REDACTED]',
        },
      });

      return {
        ...channel,
        credentialRef: undefined,
      };
    });
  }

  async testChannel(principal: Principal, id: string) {
    const channel = await this.getChannel(principal, id);
    await this.meta.listTemplates(channel);
    const [updated] = await this.database.db
      .update(channelAccounts)
      .set({ status: 'CONNECTED', updatedAt: new Date() })
      .where(
        and(
          eq(channelAccounts.organizationId, principal.organizationId),
          eq(channelAccounts.id, id),
        ),
      )
      .returning({
        id: channelAccounts.id,
        status: channelAccounts.status,
      });
    return updated;
  }

  private async getChannel(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(channelAccounts)
      .where(
        and(
          eq(channelAccounts.organizationId, principal.organizationId),
          eq(channelAccounts.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Channel account not found.');
    return rows[0];
  }

  async listConversations(principal: Principal) {
    return this.database.db
      .select({
        id: conversations.id,
        contactId: conversations.contactId,
        contactName: contacts.displayName,
        contactPhone: contacts.phone,
        channelAccountId: conversations.channelAccountId,
        assignedMemberId: conversations.assignedMemberId,
        status: conversations.status,
        handlingMode: conversations.handlingMode,
        unreadCount: conversations.unreadCount,
        lastInboundAt: conversations.lastInboundAt,
        lastOutboundAt: conversations.lastOutboundAt,
        lastMessageAt: conversations.lastMessageAt,
      })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(
        and(
          eq(conversations.organizationId, principal.organizationId),
          eq(contacts.organizationId, principal.organizationId),
        ),
      )
      .orderBy(desc(conversations.lastMessageAt))
      .limit(200);
  }

  async getConversation(principal: Principal, id: string) {
    const rows = await this.database.db
      .select({
        id: conversations.id,
        organizationId: conversations.organizationId,
        workspaceId: conversations.workspaceId,
        channelAccountId: conversations.channelAccountId,
        contactId: conversations.contactId,
        contactName: contacts.displayName,
        contactPhone: contacts.phone,
        assignedMemberId: conversations.assignedMemberId,
        status: conversations.status,
        handlingMode: conversations.handlingMode,
        unreadCount: conversations.unreadCount,
        lastInboundAt: conversations.lastInboundAt,
        lastOutboundAt: conversations.lastOutboundAt,
        lastMessageAt: conversations.lastMessageAt,
      })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(
        and(
          eq(conversations.organizationId, principal.organizationId),
          eq(conversations.id, id),
          eq(contacts.organizationId, principal.organizationId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Conversation not found.');
    return rows[0];
  }

  listMessages(principal: Principal, conversationId: string) {
    return this.database.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.organizationId, principal.organizationId),
          eq(messages.conversationId, conversationId),
        ),
      )
      .orderBy(messages.createdAt)
      .limit(500);
  }

  async updateConversation(
    principal: Principal,
    id: string,
    dto: UpdateConversationDto,
  ) {
    const before = await this.getConversation(principal, id);
    const assignedMemberId =
      dto.assignedMemberId === undefined
        ? before.assignedMemberId
        : await this.assertMember(
            principal.organizationId,
            dto.assignedMemberId,
          );

    return this.database.db.transaction(async (tx) => {
      const [conversation] = await tx
        .update(conversations)
        .set({
          assignedMemberId,
          status: dto.status,
          handlingMode: dto.handlingMode,
          handlingModeSource: dto.handlingMode ? 'USER' : undefined,
          handlingModeUpdatedAt: dto.handlingMode ? new Date() : undefined,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(conversations.organizationId, principal.organizationId),
            eq(conversations.id, id),
          ),
        )
        .returning();

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'communication.conversation.updated.v1',
        aggregateType: 'conversation',
        aggregateId: id,
        payload: {
          conversationId: id,
          assignedMemberId: conversation.assignedMemberId,
          status: conversation.status,
          handlingMode: conversation.handlingMode,
        },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: conversation.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'communication.conversation.update',
        resourceType: 'conversation',
        resourceId: id,
        before,
        after: conversation,
      });
      return conversation;
    });
  }

  async markConversationRead(
    principal: Principal,
    id: string,
  ) {
    const conversation = await this.getConversation(principal, id);
    await this.database.db
      .update(conversations)
      .set({ unreadCount: 0, updatedAt: new Date() })
      .where(
        and(
          eq(conversations.organizationId, principal.organizationId),
          eq(conversations.id, id),
        ),
      );

    const latestInbound = await this.database.db
      .select({ externalMessageId: messages.externalMessageId })
      .from(messages)
      .where(
        and(
          eq(messages.organizationId, principal.organizationId),
          eq(messages.conversationId, id),
          eq(messages.direction, 'INBOUND'),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(1);

    const externalMessageId = latestInbound[0]?.externalMessageId;
    if (externalMessageId) {
      const channel = await this.getChannel(
        principal,
        conversation.channelAccountId,
      );
      await this.meta
        .markRead(channel, externalMessageId)
        .catch(() => undefined);
    }

    return { success: true };
  }

  private async getOutboundContext(principal: Principal, conversationId: string) {
    const conversation = await this.getConversation(principal, conversationId);
    if (!conversation.contactPhone) {
      throw new BadRequestException(
        'Contact does not have a WhatsApp destination.',
      );
    }
    const channel = await this.getChannel(
      principal,
      conversation.channelAccountId,
    );
    if (channel.status !== 'CONNECTED') {
      throw new ConflictException('WhatsApp channel is not connected.');
    }
    return { conversation, channel, to: conversation.contactPhone };
  }

  async sendText(
    principal: Principal,
    conversationId: string,
    dto: SendTextMessageDto,
  ) {
    const { conversation, channel, to } = await this.getOutboundContext(
      principal,
      conversationId,
    );

    const serviceWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (
      !conversation.lastInboundAt ||
      conversation.lastInboundAt < serviceWindowStart
    ) {
      throw new ConflictException(
        'Free-form WhatsApp messages require an inbound customer message within the last 24 hours. Use an approved template.',
      );
    }

    const idempotencyKey = dto.idempotencyKey ?? randomUUID();
    const existing = await this.database.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.organizationId, principal.organizationId),
          eq(messages.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0];

    const result = await this.meta.sendText(channel, to, dto.text.trim());

    return this.database.db.transaction(async (tx) => {
      const [message] = await tx
        .insert(messages)
        .values({
          organizationId: principal.organizationId,
          conversationId,
          channelAccountId: channel.id,
          externalMessageId: result.externalMessageId,
          idempotencyKey,
          direction: 'OUTBOUND',
          messageType: 'text',
          textBody: dto.text.trim(),
          status: 'SENT',
          providerStatus: 'accepted',
          sentByMemberId: principal.membershipId,
          providerTimestamp: new Date(),
          metadata: {
            providerResponse: result.providerResponse,
          },
        })
        .returning();

      await tx
        .update(conversations)
        .set({
          lastOutboundAt: new Date(),
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId));

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'communication.message.sent.v1',
        aggregateType: 'message',
        aggregateId: message.id,
        payload: {
          messageId: message.id,
          conversationId,
          externalMessageId: message.externalMessageId,
          messageType: 'text',
        },
      });
      return message;
    });
  }

  async sendAgentText(input: {
    organizationId: string;
    conversationId: string;
    agentId: string;
    runId: string;
    text: string;
  }) {
    const rows = await this.database.db
      .select({
        conversation: conversations,
        contactPhone: contacts.phone,
        channel: channelAccounts,
      })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .innerJoin(
        channelAccounts,
        eq(channelAccounts.id, conversations.channelAccountId),
      )
      .where(
        and(
          eq(conversations.organizationId, input.organizationId),
          eq(conversations.id, input.conversationId),
          eq(contacts.organizationId, input.organizationId),
          eq(channelAccounts.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) throw new NotFoundException('Conversation not found.');
    if (row.conversation.handlingMode !== 'AI') {
      throw new ConflictException(
        'Autonomous AI replies require conversation handling mode AI.',
      );
    }
    if (!row.contactPhone) {
      throw new BadRequestException(
        'Contact does not have a WhatsApp destination.',
      );
    }
    if (row.channel.status !== 'CONNECTED') {
      throw new ConflictException('WhatsApp channel is not connected.');
    }

    const serviceWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (
      !row.conversation.lastInboundAt ||
      row.conversation.lastInboundAt < serviceWindowStart
    ) {
      throw new ConflictException(
        'Autonomous free-form WhatsApp replies require an inbound customer message within the last 24 hours.',
      );
    }

    const idempotencyKey = 'ai-run:' + input.runId;
    const existing = await this.database.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.organizationId, input.organizationId),
          eq(messages.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0];

    const result = await this.meta.sendText(
      row.channel,
      row.contactPhone,
      input.text.trim(),
    );

    return this.database.db.transaction(async (tx) => {
      const now = new Date();
      const [message] = await tx
        .insert(messages)
        .values({
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          channelAccountId: row.channel.id,
          externalMessageId: result.externalMessageId,
          idempotencyKey,
          direction: 'OUTBOUND',
          messageType: 'text',
          textBody: input.text.trim(),
          status: 'SENT',
          providerStatus: 'accepted',
          providerTimestamp: now,
          metadata: {
            sentByAgentId: input.agentId,
            aiRunId: input.runId,
            providerResponse: result.providerResponse,
          },
        })
        .returning();

      await tx
        .update(conversations)
        .set({
          lastOutboundAt: now,
          lastMessageAt: now,
          updatedAt: now,
        })
        .where(eq(conversations.id, input.conversationId));

      await tx.insert(outboxEvents).values({
        organizationId: input.organizationId,
        eventType: 'communication.message.sent_by_ai.v1',
        aggregateType: 'message',
        aggregateId: message.id,
        payload: {
          messageId: message.id,
          conversationId: input.conversationId,
          agentId: input.agentId,
          runId: input.runId,
          externalMessageId: message.externalMessageId,
        },
      });

      await tx.insert(auditLogs).values({
        organizationId: input.organizationId,
        workspaceId: row.conversation.workspaceId,
        actorType: 'AI_AGENT',
        actorId: input.agentId,
        action: 'communication.whatsapp.send',
        resourceType: 'message',
        resourceId: message.id,
        metadata: {
          conversationId: input.conversationId,
          runId: input.runId,
        },
      });

      return message;
    });
  }

  async listTemplates(principal: Principal) {
    return this.database.db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.organizationId, principal.organizationId))
      .orderBy(desc(messageTemplates.updatedAt));
  }

  async createTemplate(
    principal: Principal,
    dto: CreateTemplateDto,
  ) {
    const channel = await this.getChannel(principal, dto.channelAccountId);
    if (!channel.metaBusinessConnectionId) {
      throw new ConflictException(
        'WhatsApp templates require a Meta business connection.',
      );
    }
    const [template] = await this.database.db
      .insert(messageTemplates)
      .values({
        organizationId: principal.organizationId,
        metaBusinessConnectionId: channel.metaBusinessConnectionId,
        channelAccountId: channel.id,
        name: dto.name.trim(),
        language: dto.language,
        category: dto.category,
        status: 'LOCAL_DRAFT',
        components: dto.components,
      })
      .returning();

    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      workspaceId: channel.workspaceId,
      actorType: 'USER',
      actorId: principal.userId,
      action: 'communication.template.create',
      resourceType: 'message_template',
      resourceId: template.id,
      after: template,
    });
    return template;
  }

  async submitTemplate(principal: Principal, templateId: string) {
    const rows = await this.database.db
      .select()
      .from(messageTemplates)
      .where(
        and(
          eq(messageTemplates.organizationId, principal.organizationId),
          eq(messageTemplates.id, templateId),
        ),
      )
      .limit(1);
    const template = rows[0];
    if (!template) {
      throw new NotFoundException('Message template not found.');
    }
    if (!template.category) {
      throw new ConflictException(
        'Template category is required before Meta submission.',
      );
    }

    const channels = await this.database.db
      .select()
      .from(channelAccounts)
      .where(
        and(
          eq(channelAccounts.organizationId, principal.organizationId),
          eq(
            channelAccounts.metaBusinessConnectionId,
            template.metaBusinessConnectionId,
          ),
          eq(channelAccounts.provider, 'META'),
          eq(channelAccounts.channelType, 'WHATSAPP'),
        ),
      )
      .limit(1);
    const channel = channels[0];
    if (!channel) {
      throw new NotFoundException(
        'No WhatsApp channel is connected to this WABA.',
      );
    }

    const provider = await this.meta.createTemplate(channel, {
      name: template.name,
      language: template.language,
      category: template.category,
      components: template.components,
    });
    const providerTemplateId =
      typeof provider.id === 'string' ? provider.id : undefined;
    const providerStatus =
      typeof provider.status === 'string'
        ? provider.status
        : 'PENDING';

    return this.database.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(messageTemplates)
        .set({
          providerTemplateId,
          status: providerStatus,
          providerUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(messageTemplates.id, template.id))
        .returning();

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'communication.template.submitted.v1',
        aggregateType: 'message_template',
        aggregateId: template.id,
        payload: {
          templateId: template.id,
          providerTemplateId,
          status: providerStatus,
        },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'communication.template.submit',
        resourceType: 'message_template',
        resourceId: template.id,
        before: template,
        after: updated,
      });
      return updated;
    });
  }

  async syncTemplates(principal: Principal, channelId: string) {
    const channel = await this.getChannel(principal, channelId);
    if (!channel.metaBusinessConnectionId) {
      throw new ConflictException(
        'WhatsApp templates require a Meta business connection.',
      );
    }
    const remote = (await this.meta.listTemplates(channel)) as Array<
      Record<string, unknown>
    >;

    for (const item of remote) {
      const name = typeof item.name === 'string' ? item.name : undefined;
      const language =
        typeof item.language === 'string' ? item.language : undefined;
      if (!name || !language) continue;

      await this.database.db
        .insert(messageTemplates)
        .values({
          organizationId: principal.organizationId,
          metaBusinessConnectionId: channel.metaBusinessConnectionId,
          channelAccountId: channel.id,
          providerTemplateId:
            typeof item.id === 'string' ? item.id : undefined,
          name,
          language,
          category:
            typeof item.category === 'string' ? item.category : undefined,
          status:
            typeof item.status === 'string' ? item.status : 'UNKNOWN',
          quality:
            typeof item.quality_score === 'string'
              ? item.quality_score
              : undefined,
          components: Array.isArray(item.components) ? item.components : [],
          providerUpdatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            messageTemplates.metaBusinessConnectionId,
            messageTemplates.name,
            messageTemplates.language,
          ],
          set: {
            providerTemplateId:
              typeof item.id === 'string' ? item.id : undefined,
            category:
              typeof item.category === 'string' ? item.category : undefined,
            status:
              typeof item.status === 'string' ? item.status : 'UNKNOWN',
            quality:
              typeof item.quality_score === 'string'
                ? item.quality_score
                : undefined,
            components: Array.isArray(item.components)
              ? item.components
              : [],
            providerUpdatedAt: new Date(),
            updatedAt: new Date(),
          },
        });
    }

    return this.listTemplates(principal);
  }

  async sendTemplate(
    principal: Principal,
    conversationId: string,
    dto: SendTemplateMessageDto,
  ) {
    const { conversation, channel, to } = await this.getOutboundContext(
      principal,
      conversationId,
    );
    if (!channel.metaBusinessConnectionId) {
      throw new ConflictException(
        'WhatsApp templates require a Meta business connection.',
      );
    }
    const rows = await this.database.db
      .select()
      .from(messageTemplates)
      .where(
        and(
          eq(messageTemplates.organizationId, principal.organizationId),
          eq(
            messageTemplates.metaBusinessConnectionId,
            channel.metaBusinessConnectionId,
          ),
          eq(messageTemplates.id, dto.templateId),
        ),
      )
      .limit(1);
    const template = rows[0];
    if (!template) throw new NotFoundException('Message template not found.');
    if (template.status !== 'APPROVED' && this.config.get('META_TRANSPORT_MODE') !== 'mock') {
      throw new ConflictException('Only approved Meta templates can be sent.');
    }

    if (template.category === 'MARKETING') {
      const consent = await this.database.db
        .select({ id: communicationConsents.id })
        .from(communicationConsents)
        .where(
          and(
            eq(communicationConsents.organizationId, principal.organizationId),
            eq(communicationConsents.contactId, conversation.contactId),
            eq(communicationConsents.channelType, 'WHATSAPP'),
            eq(communicationConsents.purpose, 'MARKETING'),
            eq(communicationConsents.status, 'GRANTED'),
          ),
        )
        .limit(1);
      if (!consent[0]) {
        throw new ConflictException(
          'Marketing consent is required for this template.',
        );
      }
    }

    const idempotencyKey = dto.idempotencyKey ?? randomUUID();
    const existing = await this.database.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.organizationId, principal.organizationId),
          eq(messages.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0];

    const result = await this.meta.sendTemplate(channel, to, {
      name: template.name,
      language: template.language,
      components: dto.components,
    });

    return this.database.db.transaction(async (tx) => {
      const [message] = await tx
        .insert(messages)
        .values({
          organizationId: principal.organizationId,
          conversationId,
          channelAccountId: channel.id,
          externalMessageId: result.externalMessageId,
          idempotencyKey,
          direction: 'OUTBOUND',
          messageType: 'template',
          status: 'SENT',
          providerStatus: 'accepted',
          sentByMemberId: principal.membershipId,
          providerTimestamp: new Date(),
          metadata: {
            templateId: template.id,
            templateName: template.name,
            providerResponse: result.providerResponse,
          },
        })
        .returning();

      await tx
        .update(conversations)
        .set({
          lastOutboundAt: new Date(),
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId));

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'communication.message.sent.v1',
        aggregateType: 'message',
        aggregateId: message.id,
        payload: {
          messageId: message.id,
          conversationId,
          externalMessageId: message.externalMessageId,
          messageType: 'template',
          templateId: template.id,
        },
      });
      return message;
    });
  }

  async setConsent(
    principal: Principal,
    contactId: string,
    dto: SetConsentDto,
  ) {
    const contact = await this.database.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, principal.organizationId),
          eq(contacts.id, contactId),
        ),
      )
      .limit(1);
    if (!contact[0]) throw new NotFoundException('Contact not found.');

    const now = new Date();
    const [consent] = await this.database.db
      .insert(communicationConsents)
      .values({
        organizationId: principal.organizationId,
        contactId,
        channelType: 'WHATSAPP',
        purpose: dto.purpose,
        status: dto.status,
        source: dto.source,
        proof: dto.proof,
        capturedAt: now,
        revokedAt: dto.status === 'REVOKED' ? now : null,
      })
      .onConflictDoUpdate({
        target: [
          communicationConsents.organizationId,
          communicationConsents.contactId,
          communicationConsents.channelType,
          communicationConsents.purpose,
        ],
        set: {
          status: dto.status,
          source: dto.source,
          proof: dto.proof,
          capturedAt: now,
          revokedAt: dto.status === 'REVOKED' ? now : null,
          updatedAt: now,
        },
      })
      .returning();

    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      actorType: 'USER',
      actorId: principal.userId,
      action: 'communication.consent.set',
      resourceType: 'contact',
      resourceId: contactId,
      metadata: {
        channelType: 'WHATSAPP',
        purpose: dto.purpose,
        status: dto.status,
      },
    });
    return consent;
  }

  async createCampaign(
    principal: Principal,
    dto: CreateCampaignDto,
  ) {
    const workspaceId = await this.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    const channel = await this.getChannel(principal, dto.channelAccountId);
    if (!channel.metaBusinessConnectionId) {
      throw new ConflictException(
        'WhatsApp campaigns require a Meta business connection.',
      );
    }
    const template = await this.database.db
      .select({ id: messageTemplates.id })
      .from(messageTemplates)
      .where(
        and(
          eq(messageTemplates.organizationId, principal.organizationId),
          eq(
            messageTemplates.metaBusinessConnectionId,
            channel.metaBusinessConnectionId,
          ),
          eq(messageTemplates.id, dto.templateId),
        ),
      )
      .limit(1);
    if (!template[0]) throw new NotFoundException('Message template not found.');

    const [campaign] = await this.database.db
      .insert(campaigns)
      .values({
        organizationId: principal.organizationId,
        workspaceId,
        channelAccountId: channel.id,
        templateId: dto.templateId,
        createdByMemberId: principal.membershipId,
        name: dto.name.trim(),
        status: dto.scheduledAt ? 'SCHEDULED' : 'DRAFT',
        audienceFilters: dto.audienceFilters,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      })
      .returning();

    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      workspaceId,
      actorType: 'USER',
      actorId: principal.userId,
      action: 'communication.campaign.create',
      resourceType: 'campaign',
      resourceId: campaign.id,
      after: campaign,
    });
    return campaign;
  }

  async queueCampaign(principal: Principal, campaignId: string) {
    const rows = await this.database.db
      .select({
        campaign: campaigns,
        template: messageTemplates,
        channel: channelAccounts,
      })
      .from(campaigns)
      .innerJoin(
        messageTemplates,
        eq(messageTemplates.id, campaigns.templateId),
      )
      .innerJoin(
        channelAccounts,
        eq(channelAccounts.id, campaigns.channelAccountId),
      )
      .where(
        and(
          eq(campaigns.organizationId, principal.organizationId),
          eq(campaigns.id, campaignId),
          eq(messageTemplates.organizationId, principal.organizationId),
          eq(channelAccounts.organizationId, principal.organizationId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException('Campaign not found.');

    if (
      row.template.status !== 'APPROVED' &&
      this.config.get<string>('META_TRANSPORT_MODE') !== 'mock'
    ) {
      throw new ConflictException(
        'Only approved Meta templates can be queued.',
      );
    }

    const filters = (row.campaign.audienceFilters ?? {}) as {
      contactIds?: unknown;
      leadTemperature?: unknown;
    };
    const contactIds = Array.isArray(filters.contactIds)
      ? filters.contactIds.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const temperatures = Array.isArray(filters.leadTemperature)
      ? filters.leadTemperature.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const consentPurpose =
      row.template.category === 'MARKETING' ? 'MARKETING' : 'SERVICE';

    const predicates = [
      eq(contacts.organizationId, principal.organizationId),
      isNotNull(contacts.phone),
      eq(
        communicationConsents.organizationId,
        principal.organizationId,
      ),
      eq(communicationConsents.channelType, 'WHATSAPP'),
      eq(communicationConsents.purpose, consentPurpose),
      eq(communicationConsents.status, 'GRANTED'),
    ];
    if (contactIds.length) {
      predicates.push(inArray(contacts.id, contactIds));
    }
    if (temperatures.length) {
      predicates.push(inArray(leads.temperature, temperatures));
    }

    const audience = await this.database.db
      .selectDistinct({
        contactId: contacts.id,
        phone: contacts.phone,
      })
      .from(contacts)
      .innerJoin(
        communicationConsents,
        eq(communicationConsents.contactId, contacts.id),
      )
      .leftJoin(
        leads,
        and(
          eq(leads.organizationId, contacts.organizationId),
          eq(leads.contactId, contacts.id),
        ),
      )
      .where(and(...predicates));

    const validAudience = audience.filter(
      (item): item is { contactId: string; phone: string } =>
        Boolean(item.phone),
    );

    return this.database.db.transaction(async (tx) => {
      for (const recipient of validAudience) {
        await tx
          .insert(campaignRecipients)
          .values({
            organizationId: principal.organizationId,
            campaignId,
            contactId: recipient.contactId,
            destination: recipient.phone,
            status: 'PENDING',
          })
          .onConflictDoNothing();
      }

      const scheduled =
        row.campaign.scheduledAt &&
        row.campaign.scheduledAt.getTime() > Date.now();
      const status = validAudience.length
        ? scheduled
          ? 'SCHEDULED'
          : 'QUEUED'
        : 'NO_RECIPIENTS';

      const [campaign] = await tx
        .update(campaigns)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaignId))
        .returning();

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'communication.campaign.queued.v1',
        aggregateType: 'campaign',
        aggregateId: campaignId,
        payload: {
          campaignId,
          recipientCount: validAudience.length,
          status,
          consentPurpose,
        },
      });
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: row.campaign.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'communication.campaign.queue',
        resourceType: 'campaign',
        resourceId: campaignId,
        metadata: {
          recipientCount: validAudience.length,
          consentPurpose,
        },
      });

      return {
        campaign,
        recipientCount: validAudience.length,
      };
    });
  }

  listCampaigns(principal: Principal) {
    return this.database.db
      .select()
      .from(campaigns)
      .where(eq(campaigns.organizationId, principal.organizationId))
      .orderBy(desc(campaigns.createdAt));
  }
}
