import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { CredentialResolverService } from './credential-resolver.service.js';

export type MetaChannel = {
  providerPhoneNumberId?: string | null;
  providerAccountId?: string | null;
  credentialRef?: string | null;
};

type SendResult = {
  externalMessageId: string;
  providerResponse: Record<string, unknown>;
};

@Injectable()
export class MetaTransportService {
  constructor(
    private readonly config: ConfigService,
    private readonly credentials: CredentialResolverService,
  ) {}

  private mode() {
    return this.config.get<string>('META_TRANSPORT_MODE') ?? 'disabled';
  }

  async sendText(
    channel: MetaChannel,
    to: string,
    text: string,
  ): Promise<SendResult> {
    if (this.mode() === 'mock') {
      return {
        externalMessageId: `mock.wamid.${randomUUID()}`,
        providerResponse: { mock: true, to, type: 'text' },
      };
    }

    const response = await this.graphRequest(channel, 'messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    });

    return this.extractMessageId(response);
  }

  async sendTemplate(
    channel: MetaChannel,
    to: string,
    template: {
      name: string;
      language: string;
      components?: unknown[];
    },
  ): Promise<SendResult> {
    if (this.mode() === 'mock') {
      return {
        externalMessageId: `mock.wamid.${randomUUID()}`,
        providerResponse: { mock: true, to, type: 'template' },
      };
    }

    const response = await this.graphRequest(channel, 'messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language },
        ...(template.components?.length
          ? { components: template.components }
          : {}),
      },
    });

    return this.extractMessageId(response);
  }
  async markRead(
    channel: MetaChannel,
    externalMessageId: string,
    typing = false,
  ) {
    if (this.mode() === 'mock') {
      return { success: true, mock: true };
    }

    return this.graphRequest(channel, 'messages', {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: externalMessageId,
      ...(typing ? { typing_indicator: { type: 'text' } } : {}),
    });
  }

  async createTemplate(
    channel: MetaChannel,
    template: {
      name: string;
      language: string;
      category: string;
      components: unknown[];
    },
  ) {
    if (this.mode() === 'mock') {
      return {
        id: 'mock-template-' + randomUUID(),
        status: 'PENDING',
      };
    }

    const accountId = channel.providerAccountId;
    if (!accountId) {
      throw new ServiceUnavailableException(
        'WABA/provider account ID is required for template submission.',
      );
    }

    const token = this.credentials.resolve(
      channel.credentialRef ?? undefined,
    );
    const response = await fetch(
      `https://graph.facebook.com/${this.graphVersion()}/${accountId}/message_templates`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: template.name,
          language: template.language,
          category: template.category,
          components: template.components,
        }),
      },
    );
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Meta template submission failed.',
        { cause: body },
      );
    }
    return body;
  }

  async listTemplates(channel: MetaChannel) {
    if (this.mode() === 'mock') return [];

    const accountId = channel.providerAccountId;
    if (!accountId) {
      throw new ServiceUnavailableException(
        'WABA/provider account ID is required for template sync.',
      );
    }

    const version = this.graphVersion();
    const token = this.credentials.resolve(channel.credentialRef ?? undefined);
    const url = new URL(
      `https://graph.facebook.com/${version}/${accountId}/message_templates`,
    );
    url.searchParams.set(
      'fields',
      'id,name,language,status,category,quality_score,components',
    );
    url.searchParams.set('limit', '250');

    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Meta template sync failed.',
        { cause: body },
      );
    }
    return Array.isArray(body.data) ? body.data : [];
  }

  private phoneNumberId(channel: MetaChannel) {
    if (!channel.providerPhoneNumberId) {
      throw new ServiceUnavailableException(
        'WhatsApp Phone Number ID is not configured for this channel.',
      );
    }
    return channel.providerPhoneNumberId;
  }

  private graphVersion() {
    const version = this.config.get<string>('META_GRAPH_VERSION');
    if (!version) {
      throw new ServiceUnavailableException(
        'META_GRAPH_VERSION is not configured.',
      );
    }
    return version;
  }

  private async graphRequest(
    channel: MetaChannel,
    resource: string,
    payload: Record<string, unknown>,
  ) {
    if (this.mode() === 'disabled') {
      throw new ServiceUnavailableException(
        'Meta transport is disabled.',
      );
    }

    const token = this.credentials.resolve(channel.credentialRef ?? undefined);
    const version = this.graphVersion();
    const response = await fetch(
      `https://graph.facebook.com/${version}/${this.phoneNumberId(channel)}/${resource}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Meta Cloud API request failed.',
        { cause: body },
      );
    }
    return body;
  }

  private extractMessageId(
    response: Record<string, unknown>,
  ): SendResult {
    const rows = Array.isArray(response.messages)
      ? (response.messages as Array<Record<string, unknown>>)
      : [];
    const externalMessageId = rows[0]?.id;
    if (typeof externalMessageId !== 'string' || !externalMessageId) {
      throw new ServiceUnavailableException(
        'Meta accepted the request without returning a message ID.',
      );
    }
    return { externalMessageId, providerResponse: response };
  }
}
