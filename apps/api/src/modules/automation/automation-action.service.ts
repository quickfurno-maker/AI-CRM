import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import type { Principal } from '../../platform/auth/auth.types.js';
import { AiRuntimeService } from '../ai/ai-runtime.service.js';
import { CommunicationService } from '../communication/communication.service.js';
import type {
  SendTemplateMessageDto,
  SendTextMessageDto,
  UpdateConversationDto,
} from '../communication/dto/communication.dto.js';
import type {
  CreateTaskDto,
  UpdateLeadDto,
} from '../crm/dto/crm.dto.js';
import { EngagementService } from '../crm/engagement.service.js';
import { SalesService } from '../crm/sales.service.js';

@Injectable()
export class AutomationActionService {
  constructor(
    private readonly engagement: EngagementService,
    private readonly sales: SalesService,
    private readonly communication: CommunicationService,
    private readonly ai: AiRuntimeService,
  ) {}

  async execute(
    principal: Principal,
    action: string,
    rawInput: Record<string, unknown>,
    context: Record<string, unknown>,
  ) {
    const input = this.resolveValue(rawInput, context);
    if (!this.isRecord(input)) {
      throw new BadRequestException('Automation action input must resolve to an object.');
    }

    if (action === 'CRM_CREATE_TASK') {
      const title = this.requiredString(input, 'title');
      return this.engagement.createTask(principal, {
        workspaceId: this.optionalString(input, 'workspaceId'),
        ownerMemberId: this.optionalString(input, 'ownerMemberId'),
        contactId: this.optionalString(input, 'contactId'),
        leadId: this.optionalString(input, 'leadId'),
        dealId: this.optionalString(input, 'dealId'),
        title,
        description: this.optionalString(input, 'description'),
        priority: this.optionalString(input, 'priority'),
        dueAt: this.optionalString(input, 'dueAt'),
      } as CreateTaskDto);
    }

    if (action === 'CRM_UPDATE_LEAD') {
      const leadId = this.requiredString(input, 'leadId');
      const update = { ...input };
      delete update.leadId;
      return this.sales.updateLead(
        principal,
        leadId,
        update as UpdateLeadDto,
      );
    }

    if (action === 'WHATSAPP_SEND_TEXT') {
      const conversationId = this.requiredString(input, 'conversationId');
      const text = this.requiredString(input, 'text');
      return this.communication.sendText(principal, conversationId, {
        text,
        idempotencyKey:
          this.optionalString(input, 'idempotencyKey') ??
          this.automationIdempotencyKey(context),
      } as SendTextMessageDto);
    }

    if (action === 'WHATSAPP_SEND_TEMPLATE') {
      const conversationId = this.requiredString(input, 'conversationId');
      const templateId = this.requiredString(input, 'templateId');
      return this.communication.sendTemplate(principal, conversationId, {
        templateId,
        components: Array.isArray(input.components)
          ? input.components
          : undefined,
        idempotencyKey:
          this.optionalString(input, 'idempotencyKey') ??
          this.automationIdempotencyKey(context),
      } as SendTemplateMessageDto);
    }

    if (action === 'SET_CONVERSATION_MODE') {
      const conversationId = this.requiredString(input, 'conversationId');
      const handlingMode = this.requiredString(input, 'handlingMode');
      if (!['HUMAN', 'AI', 'AI_ASSIST'].includes(handlingMode)) {
        throw new BadRequestException('Invalid conversation handling mode.');
      }
      return this.communication.updateConversation(
        principal,
        conversationId,
        { handlingMode } as UpdateConversationDto,
      );
    }

    if (action === 'AI_RUN_AGENT') {
      const agentId = this.requiredString(input, 'agentId');
      const prompt = this.requiredString(input, 'input');
      const routing = this.optionalString(input, 'routing');
      if (
        routing &&
        !['AGENT_DEFAULT', 'FAST', 'REASONING'].includes(routing)
      ) {
        throw new BadRequestException('Invalid AI routing mode.');
      }
      return this.ai.runAgent(principal, agentId, {
        contactId: this.optionalString(input, 'contactId'),
        conversationId: this.optionalString(input, 'conversationId'),
        input: prompt,
        routing: routing as 'AGENT_DEFAULT' | 'FAST' | 'REASONING' | undefined,
      });
    }

    throw new BadRequestException('Unsupported automation action.');
  }
  resolveValue(value: unknown, context: Record<string, unknown>): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.resolveValue(item, context));
    }

    if (this.isRecord(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [
          key,
          this.resolveValue(nested, context),
        ]),
      );
    }

    if (typeof value !== 'string') return value;

    const exact = value.match(/^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/);
    if (exact) {
      return this.readPath(context, exact[1]);
    }

    return value.replace(
      /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
      (_match, path: string) => {
        const resolved = this.readPath(context, path);
        if (resolved === undefined || resolved === null) return '';
        if (typeof resolved === 'string') return resolved;
        if (
          typeof resolved === 'number' ||
          typeof resolved === 'boolean' ||
          typeof resolved === 'bigint'
        ) {
          return `${resolved}`;
        }
        if (typeof resolved === 'object') return JSON.stringify(resolved);
        return '';
      },
    );
  }

  readPath(context: Record<string, unknown>, path: string) {
    const segments = path.split('.').filter(Boolean);
    let current: unknown = context;

    for (const segment of segments) {
      if (!this.isRecord(current) || !(segment in current)) {
        return undefined;
      }
      current = current[segment];
    }
    return current;
  }

  private automationIdempotencyKey(context: Record<string, unknown>) {
    const automation = context.automation;
    if (!this.isRecord(automation)) return undefined;
    const runId = automation.runId;
    const nodeKey = automation.nodeKey;
    if (typeof runId !== 'string' || typeof nodeKey !== 'string') {
      return undefined;
    }
    return 'automation:' + runId + ':' + nodeKey;
  }

  private requiredString(input: Record<string, unknown>, key: string) {
    const value = input[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(
        'Automation action requires string field ' + key + '.',
      );
    }
    return value.trim();
  }

  private optionalString(input: Record<string, unknown>, key: string) {
    const value = input[key];
    return typeof value === 'string' && value.trim()
      ? value.trim()
      : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
