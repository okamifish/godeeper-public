import { Context } from "@deepseek-ai/cordis";
import LlmRuntime, { type GenerateOptions, type StreamChunk, type TokenUsage } from "@deepseek-ai/dsh-llm";
import { GODEEPER_PROVIDER, GoDeeperAdapter, type AiCredential, withAiCredential } from "./godeeper-adapter";

/** One model request as GoDeeper callers describe it. */
export interface AiTextRequest {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  signal?: AbortSignal;
}

export interface AiTextResult {
  text: string;
  usage?: TokenUsage;
}

let contextPromise: Promise<Context> | null = null;

/** Boot the in-process harness once and reuse it for every AI call. */
function getContext(): Promise<Context> {
  if (!contextPromise) {
    contextPromise = (async () => {
      const root = new Context();
      await root.plugin(LlmRuntime);
      root.llm.registerAdapter([GODEEPER_PROVIDER], new GoDeeperAdapter());
      return root;
    })();
  }
  return contextPromise;
}

function toOptions(request: AiTextRequest): GenerateOptions {
  return {
    provider: GODEEPER_PROVIDER,
    model: request.model,
    messages: [{ role: "user", content: [{ type: "text", text: request.prompt }] }],
    ...(request.system === undefined ? {} : { system: request.system }),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
    ...(request.stop === undefined ? {} : { stop: request.stop }),
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  };
}

function failureMessage(chunk: Extract<StreamChunk, { type: "finish" }>): string | null {
  if (chunk.reason.kind === "error" || chunk.reason.kind === "aborted") {
    return chunk.reason.failure.message;
  }
  return null;
}

/** Run one non-streaming text call through the harness. */
export async function generateAiText(
  credential: AiCredential,
  request: AiTextRequest,
): Promise<AiTextResult> {
  return withAiCredential(credential, async () => {
    const root = await getContext();
    let text = "";
    let usage: TokenUsage | undefined;
    let failure: string | null = null;

    for await (const chunk of root.llm.stream(toOptions(request))) {
      if (chunk.type === "text-delta") {
        text += chunk.text;
      } else if (chunk.type === "usage") {
        usage = chunk.usage;
      } else if (chunk.type === "finish") {
        failure = failureMessage(chunk);
      }
    }

    if (failure) throw new Error(failure);
    return { text, usage };
  });
}

/** Run one streaming text call through the harness, yielding text deltas. */
export async function streamAiText(
  credential: AiCredential,
  request: AiTextRequest,
): Promise<AsyncIterable<string>> {
  const root = await getContext();
  return flattenTextStream(root.llm.stream(toOptions(request)), credential);
}

async function* flattenTextStream(
  stream: AsyncIterable<StreamChunk>,
  credential: AiCredential,
): AsyncIterable<string> {
  const iterator = stream[Symbol.asyncIterator]();
  try {
    while (true) {
      const next = await withAiCredential(credential, () => iterator.next());
      if (next.done) return;

      const chunk = next.value;
      if (chunk.type === "text-delta") {
        yield chunk.text;
      } else if (chunk.type === "finish") {
        const failure = failureMessage(chunk);
        if (failure) throw new Error(failure);
      }
    }
  } finally {
    if (iterator.return) {
      await withAiCredential(credential, () => iterator.return!());
    }
  }
}
