import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { createHash } from 'node:crypto';

@Injectable()
export class AiProviderGatewayService {
  private readonly client?: OpenAI;

  constructor(private readonly config: ConfigService) {
    if (this.mode() === 'live') {
      const apiKey = this.config.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        throw new ServiceUnavailableException(
          'OPENAI_API_KEY is required for live AI transport.',
        );
      }
      this.client = new OpenAI({ apiKey });
    }
  }

  mode() {
    return this.config.get<string>('AI_TRANSPORT_MODE') ?? 'disabled';
  }

  fastModel() {
    return this.config.get<string>('AI_OPENAI_FAST_MODEL') ?? 'gpt-6-luna';
  }

  reasoningModel() {
    return (
      this.config.get<string>('AI_OPENAI_REASONING_MODEL') ??
      'gpt-6.1-sol'
    );
  }

  embeddingModel() {
    return (
      this.config.get<string>('AI_OPENAI_EMBEDDING_MODEL') ??
      'text-embedding-3-small'
    );
  }

  chooseModel(agentModel: string, routing?: string) {
    if (routing === 'FAST') return this.fastModel();
    if (routing === 'REASONING') return this.reasoningModel();
    if (agentModel && agentModel !== 'AUTO') return agentModel;
    return this.fastModel();
  }

  async embed(texts: string[]): Promise<{
    model: string;
    embeddings: number[][];
    inputTokens: number;
  }> {
    const model = this.embeddingModel();
    if (!texts.length) {
      return { model, embeddings: [], inputTokens: 0 };
    }

    if (this.mode() === 'mock') {
      return {
        model,
        embeddings: texts.map((text) => this.mockEmbedding(text)),
        inputTokens: texts.reduce(
          (sum, text) => sum + Math.max(1, Math.ceil(text.length / 4)),
          0,
        ),
      };
    }

    if (this.mode() !== 'live' || !this.client) {
      throw new ServiceUnavailableException('AI transport is disabled.');
    }

    const response = await this.client.embeddings.create({
      model,
      input: texts,
      encoding_format: 'float',
    });

    return {
      model,
      embeddings: response.data.map((item) => item.embedding),
      inputTokens: response.usage?.prompt_tokens ?? 0,
    };
  }

  estimateTextCostUsd(
    model: string,
    inputTokens: number,
    outputTokens: number,
  ) {
    const rates: Record<
      string,
      { inputPerMillion: number; outputPerMillion: number }
    > = {
      'gpt-6-luna': {
        inputPerMillion: 0.1,
        outputPerMillion: 0.5,
      },
      'gpt-6.1-sol': {
        inputPerMillion: 2,
        outputPerMillion: 10,
      },
    };
    const rate = rates[model];
    if (!rate) return undefined;
    const cost =
      (inputTokens / 1_000_000) * rate.inputPerMillion +
      (outputTokens / 1_000_000) * rate.outputPerMillion;
    return cost.toFixed(6);
  }

  estimateEmbeddingCostUsd(model: string, inputTokens: number) {
    if (model !== 'text-embedding-3-small') return undefined;
    return ((inputTokens / 1_000_000) * 0.02).toFixed(6);
  }

  private mockEmbedding(text: string) {
    const digest = createHash('sha256').update(text).digest();
    const values = Array.from({ length: 1536 }, () => 0);
    for (let index = 0; index < values.length; index += 1) {
      const byte = digest[index % digest.length];
      values[index] = (byte - 127.5) / 127.5;
    }
    const magnitude = Math.hypot(...values) || 1;
    return values.map((value) => value / magnitude);
  }
}
