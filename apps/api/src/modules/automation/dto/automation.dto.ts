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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWorkflowDto {
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsString() @Matches(/^[a-z][a-z0-9_-]*$/) @MaxLength(100) key: string;
  @IsString() @MinLength(1) @MaxLength(180) name: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsIn(['EVENT', 'MANUAL']) triggerType?: string;
  @IsOptional() @IsObject() triggerConfig?: Record<string, unknown>;
}

export class CreateWorkflowVersionDto {
  @IsIn(['EVENT', 'MANUAL']) triggerType: string;
  @IsObject() triggerConfig: Record<string, unknown>;
  @IsOptional() @IsInt() @Min(1) @Max(500) maxSteps?: number;
}

export class AutomationNodeDto {
  @IsString() @Matches(/^[a-z][a-z0-9_-]*$/) @MaxLength(100) nodeKey: string;
  @IsIn(['ACTION', 'CONDITION', 'WAIT', 'APPROVAL', 'END']) nodeType: string;
  @IsString() @MinLength(1) @MaxLength(180) name: string;
  @IsObject() config: Record<string, unknown>;
  @IsOptional() @IsInt() positionX?: number;
  @IsOptional() @IsInt() positionY?: number;
}

export class AutomationEdgeDto {
  @IsString() @Matches(/^[a-z][a-z0-9_-]*$/) @MaxLength(120) edgeKey: string;
  @IsString() @MaxLength(100) sourceNodeKey: string;
  @IsString() @MaxLength(100) targetNodeKey: string;
  @IsOptional() @IsString() @MaxLength(64) branchKey?: string;
  @IsOptional() @IsInt() @Min(-1000) @Max(1000) priority?: number;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class SaveWorkflowGraphDto {
  @IsString() @MaxLength(100) startNodeKey: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomationNodeDto)
  nodes: AutomationNodeDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomationEdgeDto)
  edges: AutomationEdgeDto[];
}

export class TriggerWorkflowDto {
  @IsOptional() @IsObject() context?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(100) correlationId?: string;
}

export class ProcessAutomationEventDto {
  @IsString() @MinLength(1) @MaxLength(180) eventId: string;
  @IsString() @MinLength(1) @MaxLength(180) eventType: string;
  @IsString() @MinLength(1) @MaxLength(120) aggregateType: string;
  @IsString() @MinLength(1) @MaxLength(160) aggregateId: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(100) correlationId?: string;
  @IsOptional() @IsString() @MaxLength(100) causationId?: string;
}

export class DecideAutomationApprovalDto {
  @IsIn(['APPROVED', 'REJECTED']) status: string;
  @IsOptional() @IsString() @MaxLength(4000) reason?: string;
}

export class PauseAutomationRunDto {
  @IsOptional() @IsString() @MaxLength(4000) reason?: string;
}

export class CancelAutomationRunDto {
  @IsOptional() @IsString() @MaxLength(4000) reason?: string;
}

export class ReconcileAutomationRunDto {
  @IsIn(['RETRY', 'CANCEL']) action: string;
  @IsString() @MinLength(3) @MaxLength(4000) reason: string;
  @IsOptional() @IsBoolean() confirmedNoSideEffect?: boolean;
}
