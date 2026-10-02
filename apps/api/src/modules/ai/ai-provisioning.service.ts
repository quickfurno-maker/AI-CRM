import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DatabaseService } from '../../platform/database/database.service.js';
import { workspaces } from '../../platform/database/schema.js';
import { contacts } from '../crm/crm.schema.js';
import { conversations } from '../communication/communication.schema.js';

@Injectable()
export class AiProvisioningService {
  constructor(private readonly database: DatabaseService) {}

  async resolveWorkspace(organizationId: string, requestedId?: string) {
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
          .orderBy(asc(workspaces.createdAt))
          .limit(1);
    if (!rows[0]) throw new NotFoundException('Workspace not found.');
    return rows[0].id;
  }

  async assertContact(organizationId: string, id?: string) {
    if (!id) return undefined;
    const rows = await this.database.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, organizationId),
          eq(contacts.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Contact not found.');
    return id;
  }

  async assertConversation(organizationId: string, id?: string) {
    if (!id) return undefined;
    const rows = await this.database.db
      .select({ id: conversations.id, contactId: conversations.contactId })
      .from(conversations)
      .where(
        and(
          eq(conversations.organizationId, organizationId),
          eq(conversations.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Conversation not found.');
    return rows[0];
  }
}
