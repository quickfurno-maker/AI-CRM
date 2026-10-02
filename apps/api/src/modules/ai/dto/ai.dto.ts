import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAgentDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsString() @Matches(/^[a-z][a-z0-9_-]*$/) @MaxLength(100) key: string;
  @IsString() @MinLength(1) @MaxLength(180) name: string;
  @IsString() @MinLength(1) @MaxLength(80) role: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsIn(['HUMAN', 'AI', 'AI_ASSIST']) defaultHandlingMode?: string;
  @IsOptional() @IsString() @MaxLength(120) model?: string;
  @IsString() @MinLength(10) @MaxLength(30000) instructions: string;
}

export class CreateAgentVersionDto {
  @IsOptional() @IsString() @MaxLength(120) model?: string;
  @IsString() @MinLength(10) @MaxLength(30000) instructions: string;
  @IsOptional() @IsObject() modelSettings?: Record<string, unknown>;
  @IsOptional() @IsObject() knowledgePolicy?: Record<string, unknown>;
  @IsOptional() @IsObject() guardrailPolicy?: Record<string, unknown>;
  @IsOptional() @IsObject() approvalPolicy?: Record<string, unknown>;
}

export class SetAgentToolPolicyDto {
  @IsString() @MinLength(1) @MaxLength(120) toolKey: string;
  @IsIn(['AUTO', 'APPROVAL', 'DISABLED']) mode: string;
  @IsOptional()
  @IsIn(['OWN', 'TEAM', 'BRANCH', 'WORKSPACE', 'ORGANIZATION'])
  dataScope?: string;
  @IsOptional() @IsObject() constraints?: Record<string, unknown>;
}

export class RunAgentDto {
  @IsOptional() @IsUUID() sessionId?: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsUUID() conversationId?: string;
  @IsString() @MinLength(1) @MaxLength(50000) input: string;
  @IsOptional() @IsIn(['AGENT_DEFAULT', 'FAST', 'REASONING']) routing?: string;
}

export class SimulateToolDto {
  @IsObject() arguments: Record<string, unknown>;
}

export class DecideApprovalDto {
  @IsIn(['APPROVED', 'REJECTED']) status: string;
  @IsOptional() @IsString() @MaxLength(4000) reason?: string;
}

export class CreateKnowledgeBaseDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsString() @Matches(/^[a-z][a-z0-9_-]*$/) @MaxLength(100) key: string;
  @IsString() @MinLength(1) @MaxLength(180) name: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
}

export class IngestKnowledgeTextDto {
  @IsString() @MinLength(1) @MaxLength(300) title: string;
  @IsString() @MinLength(1) @MaxLength(250000) content: string;
  @IsOptional() @IsString() @MaxLength(2000) sourceUri?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class KnowledgeSearchDto {
  @IsString() @MinLength(1) @MaxLength(4000) query: string;
  @IsOptional() @IsInt() @Min(1) @Max(20) limit?: number;
}

export class CreateEvaluationDto {
  @IsString() @MinLength(1) @MaxLength(80) evaluator: string;
  @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsOptional() score?: number;
  @IsOptional() passed?: boolean;
  @IsOptional() @IsObject() details?: Record<string, unknown>;
}

export class UpsertAiWhatsappBindingDto {
  @IsUUID() channelAccountId: string;
  @IsUUID() agentId: string;
  @IsOptional() @IsUUID() operatorMemberId?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsIn(['HUMAN', 'AI', 'AI_ASSIST']) defaultHandlingMode?: string;
  @IsOptional() @IsInt() @Min(5) @Max(100) maxContextMessages?: number;
  @IsOptional() @IsBoolean() autoReplyEnabled?: boolean;
}

export class ProcessAiWhatsappMessageDto {
  @IsUUID() messageId: string;
}

export class SeedToolPoliciesDto {
  @IsArray() policies: SetAgentToolPolicyDto[];
}
