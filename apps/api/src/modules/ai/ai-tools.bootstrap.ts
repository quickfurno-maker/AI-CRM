import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { DatabaseService } from '../../platform/database/database.service.js';
import { aiToolDefinitions } from './ai.schema.js';

const TOOLS = [
  {
    key: 'get_contact',
    name: 'Get CRM Contact',
    description:
      'Read one tenant CRM contact by ID. Use only when the contact is relevant to the active client interaction.',
    riskLevel: 'L0',
    handlerKey: 'crm.get_contact',
    inputSchema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', format: 'uuid' },
      },
      required: ['contactId'],
      additionalProperties: false,
    },
  },
  {
    key: 'search_knowledge',
    name: 'Search Tenant Knowledge',
    description:
      'Search tenant-approved knowledge for relevant business facts, policies, products, services or FAQs.',
    riskLevel: 'L0',
    handlerKey: 'knowledge.search',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 4000 },
        limit: { type: 'integer', minimum: 1, maximum: 10 },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    key: 'create_task',
    name: 'Create CRM Task',
    description:
      'Create an internal CRM follow-up task. This does not contact the customer.',
    riskLevel: 'L1',
    handlerKey: 'crm.create_task',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 240 },
        contactId: { type: 'string', format: 'uuid' },
        leadId: { type: 'string', format: 'uuid' },
        dealId: { type: 'string', format: 'uuid' },
        priority: {
          type: 'string',
          enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
        },
        dueAt: { type: 'string' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    key: 'update_lead_qualification',
    name: 'Update Lead Qualification',
    description:
      'Update only qualification fields on an existing tenant CRM lead.',
    riskLevel: 'L1',
    handlerKey: 'crm.update_lead_qualification',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', format: 'uuid' },
        temperature: {
          type: 'string',
          enum: ['COLD', 'WARM', 'HOT', 'LOST'],
        },
        score: { type: 'integer', minimum: 0, maximum: 100 },
        status: {
          type: 'string',
          enum: ['OPEN', 'QUALIFIED', 'UNQUALIFIED', 'LOST'],
        },
      },
      required: ['leadId'],
      additionalProperties: false,
    },
  },
  {
    key: 'request_human_handoff',
    name: 'Request Human Handoff',
    description:
      'Switch a WhatsApp conversation to HUMAN handling and record the reason.',
    riskLevel: 'L1',
    handlerKey: 'communication.request_human_handoff',
    inputSchema: {
      type: 'object',
      properties: {
        conversationId: { type: 'string', format: 'uuid' },
        reason: { type: 'string', minLength: 1, maxLength: 2000 },
      },
      required: ['conversationId', 'reason'],
      additionalProperties: false,
    },
  },
] as const;

@Injectable()
export class AiToolsBootstrapService implements OnApplicationBootstrap {
  constructor(private readonly database: DatabaseService) {}

  async onApplicationBootstrap() {
    for (const tool of TOOLS) {
      await this.database.db
        .insert(aiToolDefinitions)
        .values(tool)
        .onConflictDoUpdate({
          target: aiToolDefinitions.key,
          set: {
            name: tool.name,
            description: tool.description,
            riskLevel: tool.riskLevel,
            handlerKey: tool.handlerKey,
            inputSchema: tool.inputSchema,
            isActive: true,
            updatedAt: new Date(),
          },
        });
    }
  }
}
