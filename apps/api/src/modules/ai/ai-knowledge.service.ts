import { Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  cosineDistance,
  desc,
  eq,
} from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import { auditLogs, outboxEvents } from '../../platform/database/schema.js';
import {
  aiKnowledgeBases,
  aiKnowledgeChunks,
  aiKnowledgeDocuments,
  aiUsageRecords,
} from './ai.schema.js';
import { AiProviderGatewayService } from './ai-provider-gateway.service.js';
import { AiProvisioningService } from './ai-provisioning.service.js';
import type {
  CreateKnowledgeBaseDto,
  IngestKnowledgeTextDto,
} from './dto/ai.dto.js';

@Injectable()
export class AiKnowledgeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly provider: AiProviderGatewayService,
    private readonly provisioning: AiProvisioningService,
  ) {}

  listBases(principal: Principal) {
    return this.database.db
      .select()
      .from(aiKnowledgeBases)
      .where(eq(aiKnowledgeBases.organizationId, principal.organizationId))
      .orderBy(desc(aiKnowledgeBases.updatedAt));
  }

  async getBase(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(aiKnowledgeBases)
      .where(
        and(
          eq(aiKnowledgeBases.organizationId, principal.organizationId),
          eq(aiKnowledgeBases.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Knowledge base not found.');
    return rows[0];
  }

  async createBase(principal: Principal, dto: CreateKnowledgeBaseDto) {
    const workspaceId = await this.provisioning.resolveWorkspace(
      principal.organizationId,
      dto.workspaceId,
    );
    const [knowledgeBase] = await this.database.db
      .insert(aiKnowledgeBases)
      .values({
        organizationId: principal.organizationId,
        workspaceId,
        key: dto.key.trim(),
        name: dto.name.trim(),
        description: dto.description?.trim(),
        embeddingProvider: 'OPENAI',
        embeddingModel: this.provider.embeddingModel(),
      })
      .returning();

    await this.database.db.insert(auditLogs).values({
      organizationId: principal.organizationId,
      workspaceId,
      actorType: 'USER',
      actorId: principal.userId,
      action: 'ai.knowledge_base.create',
      resourceType: 'ai_knowledge_base',
      resourceId: knowledgeBase.id,
      after: knowledgeBase,
    });

    return knowledgeBase;
  }
  async listDocuments(principal: Principal, knowledgeBaseId: string) {
    await this.getBase(principal, knowledgeBaseId);
    return this.database.db
      .select()
      .from(aiKnowledgeDocuments)
      .where(
        and(
          eq(aiKnowledgeDocuments.organizationId, principal.organizationId),
          eq(aiKnowledgeDocuments.knowledgeBaseId, knowledgeBaseId),
        ),
      )
      .orderBy(desc(aiKnowledgeDocuments.createdAt));
  }

  async ingestText(
    principal: Principal,
    knowledgeBaseId: string,
    dto: IngestKnowledgeTextDto,
  ) {
    const knowledgeBase = await this.getBase(principal, knowledgeBaseId);
    const normalized = dto.content.replace(/\r\n/g, '\n').trim();
    const contentHash = createHash('sha256')
      .update(normalized)
      .digest('hex');

    const existing = await this.database.db
      .select()
      .from(aiKnowledgeDocuments)
      .where(
        and(
          eq(aiKnowledgeDocuments.organizationId, principal.organizationId),
          eq(aiKnowledgeDocuments.knowledgeBaseId, knowledgeBaseId),
          eq(aiKnowledgeDocuments.contentHash, contentHash),
        ),
      )
      .limit(1);
    if (existing[0]) {
      return { document: existing[0], deduplicated: true };
    }

    const chunks = this.chunkText(normalized);
    const embeddingResult = await this.provider.embed(
      chunks.map((chunk) => chunk.content),
    );

    return this.database.db.transaction(async (tx) => {
      const [document] = await tx
        .insert(aiKnowledgeDocuments)
        .values({
          organizationId: principal.organizationId,
          knowledgeBaseId,
          sourceType: 'MANUAL',
          sourceUri: dto.sourceUri?.trim(),
          title: dto.title.trim(),
          contentHash,
          status: 'READY',
          metadata: dto.metadata,
          processedAt: new Date(),
        })
        .returning();

      await tx.insert(aiKnowledgeChunks).values(
        chunks.map((chunk, index) => ({
          organizationId: principal.organizationId,
          knowledgeBaseId,
          documentId: document.id,
          chunkIndex: index,
          content: chunk.content,
          tokenCount: chunk.approximateTokens,
          embedding: embeddingResult.embeddings[index],
          embeddingModel: embeddingResult.model,
          metadata: { start: chunk.start, end: chunk.end },
        })),
      );

      const cost = this.provider.estimateEmbeddingCostUsd(
        embeddingResult.model,
        embeddingResult.inputTokens,
      );
      await tx.insert(aiUsageRecords).values({
        organizationId: principal.organizationId,
        workspaceId: knowledgeBase.workspaceId,
        provider: 'OPENAI',
        model: embeddingResult.model,
        operation: 'EMBEDDING',
        inputTokens: embeddingResult.inputTokens,
        outputTokens: 0,
        totalTokens: embeddingResult.inputTokens,
        units: String(chunks.length),
        estimatedCostUsd: cost,
        metadata: {
          knowledgeBaseId,
          documentId: document.id,
          chunks: chunks.length,
          costType: cost ? 'ESTIMATE' : 'UNPRICED',
        },
      });

      await tx.insert(outboxEvents).values({
        organizationId: principal.organizationId,
        eventType: 'ai.knowledge.document_ready.v1',
        aggregateType: 'ai_knowledge_document',
        aggregateId: document.id,
        payload: {
          knowledgeBaseId,
          documentId: document.id,
          chunkCount: chunks.length,
          embeddingModel: embeddingResult.model,
        },
      });

      await tx.insert(auditLogs).values({
        organizationId: principal.organizationId,
        workspaceId: knowledgeBase.workspaceId,
        actorType: 'USER',
        actorId: principal.userId,
        action: 'ai.knowledge.document.ingest',
        resourceType: 'ai_knowledge_document',
        resourceId: document.id,
        metadata: {
          knowledgeBaseId,
          chunkCount: chunks.length,
          contentHash,
        },
      });

      return { document, chunkCount: chunks.length, deduplicated: false };
    });
  }
  async search(
    principal: Principal,
    knowledgeBaseId: string,
    query: string,
    limit = 5,
  ) {
    const knowledgeBase = await this.getBase(principal, knowledgeBaseId);
    const embedded = await this.provider.embed([query.trim()]);
    const embedding = embedded.embeddings[0];
    if (!embedding) return [];

    const safeLimit = Math.min(Math.max(limit, 1), 20);

    if (this.provider.mode() === 'mock') {
      const rows = await this.database.db
        .select({
          id: aiKnowledgeChunks.id,
          documentId: aiKnowledgeChunks.documentId,
          content: aiKnowledgeChunks.content,
          embedding: aiKnowledgeChunks.embedding,
          metadata: aiKnowledgeChunks.metadata,
        })
        .from(aiKnowledgeChunks)
        .where(
          and(
            eq(aiKnowledgeChunks.organizationId, principal.organizationId),
            eq(aiKnowledgeChunks.knowledgeBaseId, knowledgeBaseId),
          ),
        );

      return rows
        .map((row) => ({
          id: row.id,
          documentId: row.documentId,
          content: row.content,
          metadata: row.metadata,
          distance: row.embedding
            ? this.cosineDistance(row.embedding, embedding)
            : 1,
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, safeLimit);
    }

    const distance = cosineDistance(aiKnowledgeChunks.embedding, embedding);
    const rows = await this.database.db
      .select({
        id: aiKnowledgeChunks.id,
        documentId: aiKnowledgeChunks.documentId,
        content: aiKnowledgeChunks.content,
        metadata: aiKnowledgeChunks.metadata,
        distance,
      })
      .from(aiKnowledgeChunks)
      .where(
        and(
          eq(aiKnowledgeChunks.organizationId, principal.organizationId),
          eq(aiKnowledgeChunks.knowledgeBaseId, knowledgeBaseId),
        ),
      )
      .orderBy(distance)
      .limit(safeLimit);

    const cost = this.provider.estimateEmbeddingCostUsd(
      embedded.model,
      embedded.inputTokens,
    );
    await this.database.db.insert(aiUsageRecords).values({
      organizationId: principal.organizationId,
      workspaceId: knowledgeBase.workspaceId,
      provider: 'OPENAI',
      model: embedded.model,
      operation: 'KNOWLEDGE_QUERY_EMBEDDING',
      inputTokens: embedded.inputTokens,
      outputTokens: 0,
      totalTokens: embedded.inputTokens,
      units: '1',
      estimatedCostUsd: cost,
      metadata: {
        knowledgeBaseId,
        costType: cost ? 'ESTIMATE' : 'UNPRICED',
      },
    });

    return rows;
  }

  async searchAcrossTenant(
    principal: Principal,
    query: string,
    limit = 5,
  ) {
    const bases = await this.database.db
      .select({ id: aiKnowledgeBases.id })
      .from(aiKnowledgeBases)
      .where(
        and(
          eq(aiKnowledgeBases.organizationId, principal.organizationId),
          eq(aiKnowledgeBases.status, 'ACTIVE'),
        ),
      );

    const perBase = Math.max(1, Math.ceil(limit / Math.max(bases.length, 1)));
    const results = (
      await Promise.all(
        bases.map((base) =>
          this.search(principal, base.id, query, perBase),
        ),
      )
    ).flat();

    return results
      .sort((a, b) => Number(a.distance) - Number(b.distance))
      .slice(0, limit);
  }
  private chunkText(content: string) {
    const target = 1600;
    const overlap = 240;
    const chunks: Array<{
      content: string;
      approximateTokens: number;
      start: number;
      end: number;
    }> = [];

    let start = 0;
    while (start < content.length) {
      let end = Math.min(content.length, start + target);
      if (end < content.length) {
        const boundary = Math.max(
          content.lastIndexOf('\n\n', end),
          content.lastIndexOf('. ', end),
          content.lastIndexOf(' ', end),
        );
        if (boundary > start + Math.floor(target * 0.55)) {
          end = boundary + 1;
        }
      }

      const text = content.slice(start, end).trim();
      if (text) {
        chunks.push({
          content: text,
          approximateTokens: Math.max(1, Math.ceil(text.length / 4)),
          start,
          end,
        });
      }

      if (end >= content.length) break;
      start = Math.max(start + 1, end - overlap);
    }
    return chunks;
  }

  private cosineDistance(a: number[], b: number[]) {
    if (!a.length || a.length !== b.length) return 1;
    let dot = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    for (let index = 0; index < a.length; index += 1) {
      dot += a[index] * b[index];
      magnitudeA += a[index] * a[index];
      magnitudeB += b[index] * b[index];
    }
    const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
    return denominator ? 1 - dot / denominator : 1;
  }
}
