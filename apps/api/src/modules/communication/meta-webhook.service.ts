import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, sql } from 'drizzle-orm';
import {
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';
import { DatabaseService } from '../../platform/database/database.service.js';
import { outboxEvents } from '../../platform/database/schema.js';
import { contacts } from '../crm/crm.schema.js';
import {
  channelAccounts,
  communicationConsents,
  conversations,
  messageAttachments,
  messages,
  messageStatusEvents,
  messageTemplates,
  webhookEvents,
} from './communication.schema.js';

type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: Record<string, unknown>;
    }>;
  }>;
};

type InboundMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: Record<string, unknown>;
  video?: Record<string, unknown>;
  audio?: Record<string, unknown>;
  document?: Record<string, unknown>;
  sticker?: Record<string, unknown>;
  context?: { id?: string };
  [key: string]: unknown;
};

@Injectable()
export class MetaWebhookService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  verifyChallenge(
    mode?: string,
    token?: string,
    challenge?: string,
  ) {
    const expected = this.config.get<string>('META_WEBHOOK_VERIFY_TOKEN');
    if (
      mode !== 'subscribe' ||
      !expected ||
      !token ||
      token !== expected ||
      !challenge
    ) {
      throw new ForbiddenException('Meta webhook verification failed.');
    }
    return challenge;
  }

  verifySignature(rawBody: Buffer, signature?: string) {
    const secret = this.config.get<string>('META_APP_SECRET');
    if (!secret) {
      throw new ForbiddenException('Meta app secret is not configured.');
    }
    if (!signature?.startsWith('sha256=')) {
      throw new ForbiddenException('Missing Meta webhook signature.');
    }

    const expected = Buffer.from(
      createHmac('sha256', secret).update(rawBody).digest('hex'),
      'hex',
    );
    const received = Buffer.from(signature.slice(7), 'hex');

    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new ForbiddenException('Invalid Meta webhook signature.');
    }
  }

  async ingest(
    rawBody: Buffer,
    signature: string | undefined,
    payload: MetaWebhookPayload,
  ) {
    this.verifySignature(rawBody, signature);

    const payloadHash = createHash('sha256')
      .update(rawBody)
      .digest('hex');

    const existing = await this.database.db
      .select()
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.provider, 'META'),
          eq(webhookEvents.payloadHash, payloadHash),
        ),
      )
      .limit(1);

    let event = existing[0];
    if (!event) {
      const [created] = await this.database.db
        .insert(webhookEvents)
        .values({
          provider: 'META',
          payloadHash,
          signature,
          payload: payload as Record<string, unknown>,
          status: 'PENDING',
        })
        .returning();
      event = created;
    }

    if (event.status === 'PROCESSED') {
      return { accepted: true, duplicate: true };
    }

    try {
      const routing = await this.processPayload(payload);

      await this.database.db
        .update(webhookEvents)
        .set({
          organizationId: routing.organizationId,
          channelAccountId: routing.channelAccountId,
          status: 'PROCESSED',
          attempts: event.attempts + 1,
          processedAt: new Date(),
          lastError: null,
        })
        .where(eq(webhookEvents.id, event.id));

      return { accepted: true, duplicate: false };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      await this.database.db
        .update(webhookEvents)
        .set({
          status: 'FAILED',
          attempts: event.attempts + 1,
          lastError: message.slice(0, 4000),
        })
        .where(eq(webhookEvents.id, event.id));
      throw error;
    }
  }

  private async processPayload(payload: MetaWebhookPayload) {
    let routedOrganizationId: string | undefined;
    let routedChannelAccountId: string | undefined;

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const metadata = this.asRecord(value.metadata);
        const phoneNumberId = this.asString(metadata?.phone_number_id);
        const channel = phoneNumberId
          ? await this.findChannel(phoneNumberId)
          : entry.id
            ? await this.findChannelByWaba(entry.id)
            : undefined;

        if (!channel) continue;

        routedOrganizationId ??= channel.organizationId;
        routedChannelAccountId ??= channel.id;

        if (routedOrganizationId !== channel.organizationId) {
          throw new ForbiddenException(
            'A single webhook payload cannot span tenants.',
          );
        }

        await this.processMessages(channel, value);
        await this.processStatuses(channel, value);
        await this.processProviderState(
          channel,
          change.field,
          value,
        );
      }
    }

    if (!routedOrganizationId || !routedChannelAccountId) {
      throw new NotFoundException(
        'No registered WhatsApp channel found in webhook payload.',
      );
    }

    return {
      organizationId: routedOrganizationId,
      channelAccountId: routedChannelAccountId,
    };
  }

  private async findChannel(phoneNumberId: string) {
    const rows = await this.database.db
      .select()
      .from(channelAccounts)
      .where(
        and(
          eq(channelAccounts.provider, 'META'),
          eq(channelAccounts.channelType, 'WHATSAPP'),
          eq(channelAccounts.providerPhoneNumberId, phoneNumberId),
        ),
      )
      .limit(1);

    const channel = rows[0];
    if (!channel) {
      throw new NotFoundException(
        'Webhook Phone Number ID is not registered.',
      );
    }
    return channel;
  }

  private async findChannelByWaba(wabaId: string) {
    const rows = await this.database.db
      .select()
      .from(channelAccounts)
      .where(
        and(
          eq(channelAccounts.provider, 'META'),
          eq(channelAccounts.channelType, 'WHATSAPP'),
          eq(channelAccounts.providerAccountId, wabaId),
        ),
      )
      .limit(1);
    return rows[0];
  }

  private async processMessages(
    channel: typeof channelAccounts.$inferSelect,
    value: Record<string, unknown>,
  ) {
    const contactRows = Array.isArray(value.contacts)
      ? (value.contacts as Array<Record<string, unknown>>)
      : [];
    const providerContacts = new Map<
      string,
      { name?: string }
    >();

    for (const providerContact of contactRows) {
      const waId = this.normalizePhone(
        this.asString(providerContact.wa_id),
      );
      if (!waId) continue;
      const profile = this.asRecord(providerContact.profile);
      providerContacts.set(waId, {
        name: this.asString(profile?.name),
      });
    }

    const inbound = Array.isArray(value.messages)
      ? (value.messages as InboundMessage[])
      : [];

    for (const item of inbound) {
      const externalMessageId = this.asString(item.id);
      const from = this.normalizePhone(this.asString(item.from));
      if (!externalMessageId || !from) continue;

      const duplicate = await this.database.db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.channelAccountId, channel.id),
            eq(messages.externalMessageId, externalMessageId),
          ),
        )
        .limit(1);
      if (duplicate[0]) continue;

      const profile = providerContacts.get(from);
      const contact = await this.resolveContact(
        channel.organizationId,
        channel.workspaceId,
        from,
        profile?.name,
      );
      const conversation = await this.resolveConversation(
        channel,
        contact.id,
      );

      const providerTimestamp = item.timestamp
        ? new Date(Number(item.timestamp) * 1000)
        : new Date();
      const type = this.asString(item.type) ?? 'unknown';
      const textBody =
        type === 'text'
          ? this.asString(item.text?.body)
          : undefined;

      await this.database.db.transaction(async (tx) => {
        const [message] = await tx
          .insert(messages)
          .values({
            organizationId: channel.organizationId,
            conversationId: conversation.id,
            channelAccountId: channel.id,
            externalMessageId,
            direction: 'INBOUND',
            messageType: type,
            textBody,
            status: 'RECEIVED',
            providerStatus: 'received',
            replyToExternalMessageId: item.context?.id,
            providerTimestamp,
            metadata: item as Record<string, unknown>,
          })
          .returning();

        await this.insertAttachment(
          tx,
          channel.organizationId,
          message.id,
          type,
          item,
        );

        if (textBody && this.isStopCommand(textBody)) {
          const now = new Date();
          await tx
            .insert(communicationConsents)
            .values({
              organizationId: channel.organizationId,
              contactId: contact.id,
              channelType: 'WHATSAPP',
              purpose: 'MARKETING',
              status: 'REVOKED',
              source: 'WHATSAPP_STOP',
              proof: { externalMessageId },
              capturedAt: now,
              revokedAt: now,
            })
            .onConflictDoUpdate({
              target: [
                communicationConsents.organizationId,
                communicationConsents.contactId,
                communicationConsents.channelType,
                communicationConsents.purpose,
              ],
              set: {
                status: 'REVOKED',
                source: 'WHATSAPP_STOP',
                proof: { externalMessageId },
                capturedAt: now,
                revokedAt: now,
                updatedAt: now,
              },
            });

          await tx.insert(outboxEvents).values({
            organizationId: channel.organizationId,
            eventType: 'communication.consent.revoked.v1',
            aggregateType: 'contact',
            aggregateId: contact.id,
            payload: {
              contactId: contact.id,
              channelType: 'WHATSAPP',
              purpose: 'MARKETING',
              source: 'WHATSAPP_STOP',
            },
          });
        }

        await tx
          .update(conversations)
          .set({
            unreadCount: sql`${conversations.unreadCount} + 1`,
            lastInboundAt: providerTimestamp,
            lastMessageAt: providerTimestamp,
            status: 'OPEN',
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, conversation.id));

        await tx.insert(outboxEvents).values({
          organizationId: channel.organizationId,
          eventType: 'communication.message.received.v1',
          aggregateType: 'message',
          aggregateId: message.id,
          payload: {
            messageId: message.id,
            conversationId: conversation.id,
            contactId: contact.id,
            channelAccountId: channel.id,
            messageType: type,
          },
        });
      });
    }
  }

  private async resolveContact(
    organizationId: string,
    workspaceId: string,
    phone: string,
    profileName?: string,
  ) {
    const rows = await this.database.db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, organizationId),
          eq(contacts.phone, phone),
        ),
      )
      .limit(1);

    if (rows[0]) return rows[0];

    const [created] = await this.database.db
      .insert(contacts)
      .values({
        organizationId,
        workspaceId,
        displayName: profileName?.trim() || phone,
        phone,
        source: 'WHATSAPP',
        lifecycleStage: 'LEAD',
        status: 'ACTIVE',
      })
      .returning();
    return created;
  }

  private async resolveConversation(
    channel: typeof channelAccounts.$inferSelect,
    contactId: string,
  ) {
    const rows = await this.database.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.channelAccountId, channel.id),
          eq(conversations.contactId, contactId),
        ),
      )
      .limit(1);

    if (rows[0]) return rows[0];

    const [created] = await this.database.db
      .insert(conversations)
      .values({
        organizationId: channel.organizationId,
        workspaceId: channel.workspaceId,
        channelAccountId: channel.id,
        contactId,
        status: 'OPEN',
        handlingMode: 'HUMAN',
        unreadCount: 0,
      })
      .returning();
    return created;
  }

  private async insertAttachment(
    tx: Parameters<
      Parameters<typeof this.database.db.transaction>[0]
    >[0],
    organizationId: string,
    messageId: string,
    type: string,
    item: InboundMessage,
  ) {
    const media = this.asRecord(item[type]);
    const providerMediaId = this.asString(media?.id);
    if (!providerMediaId) return;

    await tx.insert(messageAttachments).values({
      organizationId,
      messageId,
      mediaType: type,
      providerMediaId,
      mimeType: this.asString(media?.mime_type),
      fileName: this.asString(media?.filename),
      caption: this.asString(media?.caption),
    });
  }

  private async processStatuses(
    channel: typeof channelAccounts.$inferSelect,
    value: Record<string, unknown>,
  ) {
    const statuses = Array.isArray(value.statuses)
      ? (value.statuses as Array<Record<string, unknown>>)
      : [];

    for (const statusRow of statuses) {
      const externalMessageId = this.asString(statusRow.id);
      const providerStatus = this.asString(statusRow.status);
      if (!externalMessageId || !providerStatus) continue;

      const rows = await this.database.db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.organizationId, channel.organizationId),
            eq(messages.channelAccountId, channel.id),
            eq(messages.externalMessageId, externalMessageId),
          ),
        )
        .limit(1);
      const message = rows[0];
      if (!message) continue;

      const errors = Array.isArray(statusRow.errors)
        ? (statusRow.errors as Array<Record<string, unknown>>)
        : [];
      const firstError = errors[0];
      const providerTimestamp = this.asString(statusRow.timestamp)
        ? new Date(Number(statusRow.timestamp) * 1000)
        : new Date();

      await this.database.db.transaction(async (tx) => {
        await tx
          .update(messages)
          .set({
            status: this.mapStatus(providerStatus),
            providerStatus,
            providerTimestamp,
            failureCode: this.asString(firstError?.code),
            failureMessage:
              this.asString(firstError?.message) ??
              this.asString(firstError?.title),
            updatedAt: new Date(),
          })
          .where(eq(messages.id, message.id));

        await tx.insert(messageStatusEvents).values({
          organizationId: channel.organizationId,
          messageId: message.id,
          status: providerStatus.toUpperCase(),
          providerTimestamp,
          payload: statusRow,
        });

        await tx.insert(outboxEvents).values({
          organizationId: channel.organizationId,
          eventType: 'communication.message.status_changed.v1',
          aggregateType: 'message',
          aggregateId: message.id,
          payload: {
            messageId: message.id,
            conversationId: message.conversationId,
            externalMessageId,
            providerStatus,
          },
        });
      });
    }
  }

  private async processProviderState(
    channel: typeof channelAccounts.$inferSelect,
    field: string | undefined,
    value: Record<string, unknown>,
  ) {
    if (!field) return;

    if (field.includes('message_template')) {
      if (!channel.metaBusinessConnectionId) return;

      const providerTemplateId =
        this.asString(value.message_template_id) ??
        this.asString(value.id);
      const name =
        this.asString(value.message_template_name) ??
        this.asString(value.name);
      const language =
        this.asString(value.message_template_language) ??
        this.asString(value.language);
      const status =
        this.asString(value.event) ??
        this.asString(value.status);
      const qualityRecord = this.asRecord(value.quality_score);
      const quality =
        this.asString(value.quality) ??
        this.asString(qualityRecord?.score);

      const baseUpdate = {
        ...(status ? { status } : {}),
        ...(quality ? { quality } : {}),
        providerUpdatedAt: new Date(),
        updatedAt: new Date(),
      };

      let updated: Array<{ id: string }> = [];
      if (providerTemplateId) {
        updated = await this.database.db
          .update(messageTemplates)
          .set(baseUpdate)
          .where(
            and(
              eq(
                messageTemplates.organizationId,
                channel.organizationId,
              ),
              eq(
                messageTemplates.metaBusinessConnectionId,
                channel.metaBusinessConnectionId,
              ),
              eq(
                messageTemplates.providerTemplateId,
                providerTemplateId,
              ),
            ),
          )
          .returning({ id: messageTemplates.id });
      } else if (name && language && channel.metaBusinessConnectionId) {
        updated = await this.database.db
          .update(messageTemplates)
          .set(baseUpdate)
          .where(
            and(
              eq(
                messageTemplates.organizationId,
                channel.organizationId,
              ),
              eq(
                messageTemplates.metaBusinessConnectionId,
                channel.metaBusinessConnectionId,
              ),
              eq(messageTemplates.name, name),
              eq(messageTemplates.language, language),
            ),
          )
          .returning({ id: messageTemplates.id });
      }

      for (const template of updated) {
        await this.database.db.insert(outboxEvents).values({
          organizationId: channel.organizationId,
          eventType: 'communication.template.provider_state_changed.v1',
          aggregateType: 'message_template',
          aggregateId: template.id,
          payload: {
            templateId: template.id,
            field,
            status,
            quality,
          },
        });
      }
      return;
    }

    if (
      field.includes('phone_number_quality') ||
      field.includes('phone_number_name')
    ) {
      const currentMetadata = channel.metadata ?? {};
      const metadata = {
        ...currentMetadata,
        lastMetaPhoneEvent: {
          field,
          value,
          receivedAt: new Date().toISOString(),
        },
      };
      await this.database.db
        .update(channelAccounts)
        .set({ metadata, updatedAt: new Date() })
        .where(eq(channelAccounts.id, channel.id));
    }
  }

  private mapStatus(status: string) {
    const normalized = status.toLowerCase();
    if (normalized === 'sent') return 'SENT';
    if (normalized === 'delivered') return 'DELIVERED';
    if (normalized === 'read') return 'READ';
    if (normalized === 'failed') return 'FAILED';
    return normalized.toUpperCase();
  }

  private isStopCommand(value: string) {
    const normalized = value.trim().toUpperCase();
    return [
      'STOP',
      'STOP ALL',
      'UNSUBSCRIBE',
      'CANCEL',
      'END',
      'QUIT',
    ].includes(normalized);
  }

  private normalizePhone(value?: string) {
    const digits = value?.replace(/\D/g, '');
    return digits || undefined;
  }

  private asRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private asString(value: unknown) {
    return typeof value === 'string' ? value : undefined;
  }
}
