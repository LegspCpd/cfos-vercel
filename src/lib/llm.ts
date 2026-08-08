import OpenAI from 'openai';

export interface ChatMessageIn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Build an OpenAI-compatible client. Supports OpenAI, any OpenAI-compatible endpoint
// (DeepSeek, local ollama, etc.), and Anthropic via the OpenAI compatibility layer.
export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not configured. Set it in .env (or use an OpenAI-compatible base URL).',
    );
  }
  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
}

export function defaultModel(): string {
  return process.env.DEFAULT_MODEL || 'gpt-4o-mini';
}

// Non-streaming completion (used for short structured steps).
export async function complete(
  messages: ChatMessageIn[],
  model?: string,
): Promise<string> {
  const client = getOpenAIClient();
  const res = await client.chat.completions.create({
    model: model ?? defaultModel(),
    messages,
  });
  return res.choices[0]?.message?.content ?? '';
}

// Create a streaming completion. Returns the SDK stream so callers can pipe it to the client.
export function streamCompletion(messages: ChatMessageIn[], model?: string) {
  const client = getOpenAIClient();
  return client.chat.completions.create({
    model: model ?? defaultModel(),
    messages,
    stream: true,
  });
}
