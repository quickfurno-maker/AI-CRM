import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import { auditLogs, workspaces } from '../../platform/database/schema.js';
import {
  channelAccounts,
  metaBusinessConnections,
} from './communication.schema.js';
import type {
  BeginEmbeddedSignupDto,
  CompleteEmbeddedSignupDto,
} from './dto/communication.dto.js';

@Injectable()
export class MetaPartnerService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  private mode() {
    return this.config.get<string>('META_TRANSPORT_MODE') ?? 'disabled';
  }

  private graphVersion() {
    const value = this.config.get<string>('META_GRAPH_VERSION');
    if (!value) {
      throw new ServiceUnavailableException('META_GRAPH_VERSION is not configured.');
    }
    return value;
  }

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

  listConnections(principal: Principal) {
    return this.database.db
      .select({
        id: metaBusinessConnections.id,
        workspaceId: metaBusinessConnections.workspaceId,
        onboardingMode: metaBusinessConnections.onboardingMode,
        connectionStatus: metaBusinessConnections.connectionStatus,
        clientAssetOwnership: metaBusinessConnections.clientAssetOwnership,
        partnerRole: metaBusinessConnections.partnerRole,
        billingMode: metaBusinessConnections.billingMode,
        metaBusinessPortfolioId:
          metaBusinessConnections.metaBusinessPortfolioId,
        wabaId: metaBusinessConnections.wabaId,
        assignedSystemUserId: metaBusinessConnections.assignedSystemUserId,
        appSubscribedAt: metaBusinessConnections.appSubscribedAt,
        accessGrantedAt: metaBusinessConnections.accessGrantedAt,
        connectedAt: metaBusinessConnections.connectedAt,
        disconnectedAt: metaBusinessConnections.disconnectedAt,
        lastSyncedAt: metaBusinessConnections.lastSyncedAt,
        createdAt: metaBusinessConnections.createdAt,
        updatedAt: metaBusinessConnections.updatedAt,
      })
      .from(metaBusinessConnections)
      .where(
        eq(
          metaBusinessConnections.organizationId,
          principal.organizationId,
        ),
      );
  }

  async begin(
    principal: Principal,
    dto: BeginEmbeddedSignupDto,
  ) {
    const workspaceId = await this.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    if (this.mode() === 'disabled') {
      throw new ServiceUnavailableException(
        'Meta Embedded Signup is disabled.',
      );
    }

    const appId = this.config.get<string>('META_APP_ID');
    const configId = this.config.get<string>('META_EMBEDDED_SIGNUP_CONFIG_ID');
    if (!appId || !configId) {
      throw new ServiceUnavailableException(
        'Meta Embedded Signup is not configured.',
      );
    }

    const state = randomUUID();
    const [connection] = await this.database.db
      .insert(metaBusinessConnections)
      .values({
        organizationId: principal.organizationId,
        workspaceId,
        onboardingMode: 'EMBEDDED_SIGNUP',
        connectionStatus: 'EMBEDDED_SIGNUP_STARTED',
        clientAssetOwnership: 'CLIENT',
        partnerRole: 'TECH_PROVIDER',
        billingMode: 'CLIENT_DIRECT',
        embeddedSignupState: state,
      })
      .returning();

    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      workspaceId,
      actorType: 'USER',
      actorId: principal.userId,
      action: 'communication.meta_signup.begin',
      resourceType: 'meta_business_connection',
      resourceId: connection.id,
      metadata: { onboardingMode: 'EMBEDDED_SIGNUP' },
    });

    return {
      connectionId: connection.id,
      state,
      appId,
      configId,
      graphVersion: this.config.get<string>('META_GRAPH_VERSION'),
    };
  }

  async complete(
    principal: Principal,
    dto: CompleteEmbeddedSignupDto,
  ) {
    const rows = await this.database.db
      .select()
      .from(metaBusinessConnections)
      .where(
        and(
          eq(metaBusinessConnections.organizationId, principal.organizationId),
          eq(metaBusinessConnections.id, dto.connectionId),
        ),
      )
      .limit(1);
    const connection = rows[0];
    if (!connection) {
      throw new NotFoundException('Meta business connection not found.');
    }
    if (
      connection.connectionStatus !== 'EMBEDDED_SIGNUP_STARTED' &&
      connection.connectionStatus !== 'ACTION_REQUIRED'
    ) {
      throw new ConflictException('Meta connection is not awaiting signup completion.');
    }
    if (
      !connection.embeddedSignupState ||
      connection.embeddedSignupState !== dto.signupState
    ) {
      throw new BadRequestException(
        'Embedded Signup state does not match this onboarding session.',
      );
    }

    const owner = await this.database.db
      .select({ organizationId: metaBusinessConnections.organizationId })
      .from(metaBusinessConnections)
      .where(eq(metaBusinessConnections.wabaId, dto.wabaId))
      .limit(1);
    if (
      owner[0] &&
      owner[0].organizationId !== principal.organizationId
    ) {
      throw new ConflictException(
        'This WABA is already attached to another tenant.',
      );
    }

    const mode = this.mode();
    let customerAuthorizationVerified = false;

    if (mode === 'live') {
      const customerToken = await this.resolveCustomerAccessToken(dto);
      await this.verifyCustomerAssets(
        customerToken,
        dto.wabaId,
        dto.phoneNumberId,
      );
      await this.verifySharedWaba(dto.wabaId);
      customerAuthorizationVerified = true;

      await this.assignSystemUser(dto.wabaId);
      await this.subscribeApp(dto.wabaId);
      if (dto.pin) {
        await this.registerPhone(dto.phoneNumberId, dto.pin);
      }
    } else if (mode === 'mock') {
      customerAuthorizationVerified = true;
    } else {
      throw new ServiceUnavailableException(
        'Meta Embedded Signup transport is disabled.',
      );
    }

    const credentialRef =
      this.mode() === 'mock'
        ? 'mock:meta-system-user'
        : 'env:META_SYSTEM_USER_ACCESS_TOKEN';

    return this.database.db.transaction(async (tx) => {
      const now = new Date();
      const [updated] = await tx
        .update(metaBusinessConnections)
        .set({
          metaBusinessPortfolioId:
            dto.businessPortfolioId ?? connection.metaBusinessPortfolioId,
          wabaId: dto.wabaId,
          assignedSystemUserId:
            this.config.get<string>('META_SYSTEM_USER_ID') ??
            connection.assignedSystemUserId,
          credentialRef,
          connectionStatus: dto.pin || this.mode() === 'mock'
            ? 'CONNECTED'
            : 'PHONE_REGISTRATION_PENDING',
          accessGrantedAt: now,
          appSubscribedAt: now,
          connectedAt:
            dto.pin || this.mode() === 'mock' ? now : connection.connectedAt,
          lastSyncedAt: now,
          updatedAt: now,
        })
        .where(eq(metaBusinessConnections.id, connection.id))
        .returning();

      const [channel] = await tx
        .insert(channelAccounts)
        .values({
          organizationId: principal.organizationId,
          workspaceId: connection.workspaceId,
          metaBusinessConnectionId: connection.id,
          provider: 'META',
          channelType: 'WHATSAPP',
          providerAccountId: dto.wabaId,
          providerPhoneNumberId: dto.phoneNumberId,
          displayName: dto.displayName?.trim(),
          displayAddress: dto.displayAddress?.trim(),
          credentialRef,
          status:
            dto.pin || this.mode() === 'mock' ? 'CONNECTED' : 'CONFIGURED',
        })
        .onConflictDoUpdate({
          target: [
            channelAccounts.provider,
            channelAccounts.providerPhoneNumberId,
          ],
          set: {
            metaBusinessConnectionId: connection.id,
            providerAccountId: dto.wabaId,
            displayName: dto.displayName?.trim(),
            displayAddress: dto.displayAddress?.trim(),
            credentialRef,
            status:
              dto.pin || this.mode() === 'mock' ? 'CONNECTED' : 'CONFIGURED',
            updatedAt: now,
          },
        })
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: connection.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'communication.meta_signup.complete',
        resourceType: 'meta_business_connection',
        resourceId: connection.id,
        metadata: {
          wabaId: dto.wabaId,
          phoneNumberId: dto.phoneNumberId,
          registrationCompleted: Boolean(dto.pin || mode === 'mock'),
          customerAuthorizationVerified,
        },
      });

      return {
        connection: {
          ...updated,
          credentialRef: undefined,
        },
        channel: {
          ...channel,
          credentialRef: undefined,
        },
      };
    });
  }

  async registerPhoneForConnection(
    principal: Principal,
    connectionId: string,
    pin: string,
  ) {
    const rows = await this.database.db
      .select({
        connection: metaBusinessConnections,
        channel: channelAccounts,
      })
      .from(metaBusinessConnections)
      .innerJoin(
        channelAccounts,
        eq(
          channelAccounts.metaBusinessConnectionId,
          metaBusinessConnections.id,
        ),
      )
      .where(
        and(
          eq(metaBusinessConnections.organizationId, principal.organizationId),
          eq(metaBusinessConnections.id, connectionId),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row || !row.channel.providerPhoneNumberId) {
      throw new NotFoundException('Meta phone connection not found.');
    }

    if (this.mode() === 'live') {
      await this.registerPhone(row.channel.providerPhoneNumberId, pin);
    }

    const now = new Date();
    await this.database.db.transaction(async (tx) => {
      await tx
        .update(metaBusinessConnections)
        .set({
          connectionStatus: 'CONNECTED',
          connectedAt: now,
          lastSyncedAt: now,
          updatedAt: now,
        })
        .where(eq(metaBusinessConnections.id, connectionId));

      await tx
        .update(channelAccounts)
        .set({ status: 'CONNECTED', updatedAt: now })
        .where(eq(channelAccounts.id, row.channel.id));

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: row.connection.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'communication.meta_phone.register',
        resourceType: 'meta_business_connection',
        resourceId: connectionId,
        metadata: { phoneNumberId: row.channel.providerPhoneNumberId },
      });
    });

    return { success: true };
  }

  async disconnect(principal: Principal, connectionId: string) {
    const rows = await this.database.db
      .select()
      .from(metaBusinessConnections)
      .where(
        and(
          eq(metaBusinessConnections.organizationId, principal.organizationId),
          eq(metaBusinessConnections.id, connectionId),
        ),
      )
      .limit(1);
    const connection = rows[0];
    if (!connection) {
      throw new NotFoundException('Meta business connection not found.');
    }

    const now = new Date();
    await this.database.db.transaction(async (tx) => {
      await tx
        .update(metaBusinessConnections)
        .set({
          connectionStatus: 'DISCONNECTED',
          disconnectedAt: now,
          updatedAt: now,
        })
        .where(eq(metaBusinessConnections.id, connectionId));
      await tx
        .update(channelAccounts)
        .set({ status: 'DISCONNECTED', updatedAt: now })
        .where(eq(channelAccounts.metaBusinessConnectionId, connectionId));
      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: connection.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'communication.meta_signup.disconnect',
        resourceType: 'meta_business_connection',
        resourceId: connectionId,
      });
    });
    return { success: true };
  }

  private async resolveCustomerAccessToken(
    dto: CompleteEmbeddedSignupDto,
  ) {
    if (dto.authorizationCode) {
      return this.exchangeAuthorizationCode(dto.authorizationCode);
    }
    if (dto.accessToken) {
      await this.verifyAccessToken(dto.accessToken);
      return dto.accessToken;
    }
    throw new BadRequestException(
      'Meta Embedded Signup authorization code is required.',
    );
  }

  private async exchangeAuthorizationCode(code: string) {
    const appId = this.config.get<string>('META_APP_ID');
    const appSecret = this.config.get<string>('META_APP_SECRET');
    if (!appId || !appSecret) {
      throw new ServiceUnavailableException(
        'Meta app credentials are not configured.',
      );
    }

    const url = new URL(
      `https://graph.facebook.com/${this.graphVersion()}/oauth/access_token`,
    );
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('code', code);

    const response = await fetch(url, { cache: 'no-store' });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok || typeof body.access_token !== 'string') {
      throw new BadRequestException(
        'Meta Embedded Signup authorization code exchange failed.',
        { cause: body },
      );
    }

    await this.verifyAccessToken(body.access_token);
    return body.access_token;
  }

  private async verifyAccessToken(token: string) {
    const appId = this.config.get<string>('META_APP_ID');
    const appSecret = this.config.get<string>('META_APP_SECRET');
    if (!appId || !appSecret) {
      throw new ServiceUnavailableException(
        'Meta app credentials are not configured.',
      );
    }

    const url = new URL(
      `https://graph.facebook.com/${this.graphVersion()}/debug_token`,
    );
    url.searchParams.set('input_token', token);
    url.searchParams.set(
      'access_token',
      `${appId}|${appSecret}`,
    );

    const response = await fetch(url, { cache: 'no-store' });
    const body = (await response.json()) as {
      data?: {
        app_id?: string;
        is_valid?: boolean;
      };
    };
    if (
      !response.ok ||
      !body.data?.is_valid ||
      body.data.app_id !== appId
    ) {
      throw new BadRequestException(
        'Meta Embedded Signup authorization is invalid.',
      );
    }
  }

  private async verifyCustomerAssets(
    token: string,
    wabaId: string,
    phoneNumberId: string,
  ) {
    const headers = { authorization: `Bearer ${token}` };
    const wabaResponse = await fetch(
      `https://graph.facebook.com/${this.graphVersion()}/${wabaId}?fields=id,name`,
      { headers, cache: 'no-store' },
    );
    const waba = (await wabaResponse.json()) as Record<string, unknown>;
    if (!wabaResponse.ok || waba.id !== wabaId) {
      throw new BadRequestException(
        'Authorized Meta session cannot access the selected WABA.',
      );
    }

    const phoneResponse = await fetch(
      `https://graph.facebook.com/${this.graphVersion()}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,status`,
      { headers, cache: 'no-store' },
    );
    const phoneBody = (await phoneResponse.json()) as {
      data?: Array<Record<string, unknown>>;
    };
    if (!phoneResponse.ok) {
      throw new BadRequestException(
        'Unable to verify the selected WhatsApp phone number.',
      );
    }

    const phone = (phoneBody.data ?? []).find(
      (item) => item.id === phoneNumberId,
    );
    if (!phone) {
      throw new BadRequestException(
        'Selected phone number does not belong to the authorized WABA.',
      );
    }
  }

  private async verifySharedWaba(wabaId: string) {
    const businessId = this.config.get<string>(
      'META_PROVIDER_BUSINESS_ID',
    );
    if (!businessId) {
      throw new ServiceUnavailableException(
        'META_PROVIDER_BUSINESS_ID is not configured.',
      );
    }

    let url: string | undefined =
      `https://graph.facebook.com/${this.graphVersion()}/${businessId}/client_whatsapp_business_accounts?fields=id&limit=100`;
    let pages = 0;

    while (url && pages < 10) {
      const response = await fetch(url, {
        headers: {
          authorization: `Bearer ${this.systemUserToken()}`,
        },
        cache: 'no-store',
      });
      const body = (await response.json()) as {
        data?: Array<{ id?: string }>;
        paging?: { next?: string };
      };
      if (!response.ok) {
        throw new ServiceUnavailableException(
          'Unable to verify shared WABA access.',
          { cause: body },
        );
      }
      if ((body.data ?? []).some((item) => item.id === wabaId)) {
        return;
      }
      url = body.paging?.next;
      pages += 1;
    }

    throw new BadRequestException(
      'The selected WABA is not shared with this provider business.',
    );
  }

  private systemUserToken() {
    const token = this.config.get<string>('META_SYSTEM_USER_ACCESS_TOKEN');
    if (!token) {
      throw new ServiceUnavailableException(
        'META_SYSTEM_USER_ACCESS_TOKEN is not configured.',
      );
    }
    return token;
  }

  private async graphRequest(
    path: string,
    init: RequestInit,
  ) {
    const headers = new Headers(init.headers);
    headers.set(
      'authorization',
      `Bearer ${this.systemUserToken()}`,
    );

    const response = await fetch(
      `https://graph.facebook.com/${this.graphVersion()}/${path}`,
      {
        ...init,
        headers,
      },
    );
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Meta partner onboarding request failed.',
        { cause: body },
      );
    }
    return body;
  }

  private assignSystemUser(wabaId: string) {
    const systemUserId = this.config.get<string>('META_SYSTEM_USER_ID');
    if (!systemUserId) {
      throw new ServiceUnavailableException(
        'META_SYSTEM_USER_ID is not configured.',
      );
    }
    const query = new URLSearchParams({
      user: systemUserId,
      tasks: JSON.stringify(['MANAGE']),
    });
    return this.graphRequest(
      `${wabaId}/assigned_users?${query.toString()}`,
      { method: 'POST' },
    );
  }

  private subscribeApp(wabaId: string) {
    return this.graphRequest(`${wabaId}/subscribed_apps`, {
      method: 'POST',
    });
  }

  private registerPhone(phoneNumberId: string, pin: string) {
    return this.graphRequest(`${phoneNumberId}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        pin,
      }),
    });
  }
}
