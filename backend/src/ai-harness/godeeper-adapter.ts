import { AsyncLocalStorage } from "node:async_hooks";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import {
  INVALID_CREDENTIAL_CODE,
  LlmAdapter,
  LlmError,
  type GenerateOptions,
  type StreamChunk,
  type TokenUsage,
} from "@deepseek-ai/dsh-llm";

/** DSH provider route owned by GoDeeper. */
export const GODEEPER_PROVIDER = "godeeper";

/** Per-request BYOK credential used by the adapter. */
export interface AiCredential {
  apiKey: string;
  provider: string;
  baseUrl?: string | null;
}

const credentialStore = new AsyncLocalStorage<AiCredential>();

/**
 * Run one AI operation with the caller's credential bound to the async context.
 * The adapter reads it back when its stream body executes.
 */
export function withAiCredential<T>(credential: AiCredential, fn: () => Promise<T>): Promise<T> {
  return credentialStore.run(credential, fn) as Promise<T>;
}

function createModel(credential: AiCredential, modelName: string) {
  const baseURL = credential.baseUrl
    ?? (credential.provider === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : credential.provider === "anthropic"
        ? "https://api.anthropic.com/v1"
        : credential.provider === "siliconflow"
          ? "https://api.siliconflow.cn/v1"
          : undefined);

  const openai = createOpenAI({ apiKey: credential.apiKey, baseURL });
  // Non-OpenAI providers don't support the /responses endpoint.
  // Use chat completions (/chat/completions) for all non-openai providers.
  if (credential.provider === "openai") return openai(modelName);
  return openai.chat(modelName);
}

/** Flatten text blocks into one prompt; Phase 0 only sends single-turn text requests. */
function toPrompt(messages: GenerateOptions["messages"]): string {
  return messages
    .map((message) =>
      message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n"),
    )
    .filter((text) => text.length > 0)
    .join("\n\n");
}

function toTokenUsage(usage: Awaited<ReturnType<typeof streamText>["usage"]>): TokenUsage {
  return {
    inputTokens: usage.inputTokenDetails?.noCacheTokens ?? usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    ...(usage.totalTokens === undefined ? {} : { totalTokens: usage.totalTokens }),
    ...(usage.inputTokenDetails?.cacheReadTokens === undefined
      ? {}
      : { cacheReadTokens: usage.inputTokenDetails.cacheReadTokens }),
    ...(usage.inputTokenDetails?.cacheWriteTokens === undefined
      ? {}
      : { cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens }),
    ...(usage.outputTokenDetails?.reasoningTokens === undefined
      ? {}
      : { reasoningTokens: usage.outputTokenDetails.reasoningTokens }),
  };
}

/**
 * Adapter that keeps the existing Vercel AI SDK + BYOK implementation behind
 * the DSH model seam. It only emits text blocks.
 */
export class GoDeeperAdapter extends LlmAdapter {
  providerInfo(provider: string) {
    return { id: provider, name: "GoDeeper (user-provided key)" };
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const credential = credentialStore.getStore();
    if (!credential) {
      throw new LlmError(
        "GoDeeper adapter: no credential bound to the current AI request",
        INVALID_CREDENTIAL_CODE,
      );
    }

    const result = streamText({
      model: createModel(credential, options.model),
      prompt: toPrompt(options.messages),
      ...(options.system === undefined ? {} : { system: options.system }),
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(options.maxTokens === undefined ? {} : { maxOutputTokens: options.maxTokens }),
      ...(options.stop === undefined ? {} : { stopSequences: options.stop }),
      ...(options.signal === undefined ? {} : { abortSignal: options.signal }),
    });

    yield { type: "block-start", index: 0, blockType: "text" };

    let text = "";
    for await (const delta of result.textStream) {
      text += delta;
      yield { type: "text-delta", index: 0, text: delta };
    }

    yield { type: "block-end", index: 0, block: { type: "text", text } };

    yield { type: "usage", usage: toTokenUsage(await result.usage) };

    const finishReason = await result.finishReason;
    yield {
      type: "finish",
      reason: finishReason === "length" ? { kind: "max-tokens" } : { kind: "stop" },
    };
  }
}
