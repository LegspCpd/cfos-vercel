import OpenAI from 'openai';
import { prisma } from './db';

export interface ChatMessageIn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

// Fallback provider from environment variables (used when no DB providers exist).
function envFallbackProvider(): AiProviderConfig | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    id: 'env',
    name: process.env.OPENAI_PROVIDER_NAME || 'Default',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey,
    model: process.env.DEFAULT_MODEL || 'gpt-4o-mini',
  };
}

// All enabled providers: DB-configured first, then env fallback.
export async function listProviders(): Promise<AiProviderConfig[]> {
  const dbProviders = await prisma.aiProvider.findMany({
    where: { isEnabled: true },
    orderBy: { createdAt: 'asc' },
  });
  const providers = dbProviders.map((p) => ({
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    apiKey: p.apiKey,
    model: p.model,
  }));
  const env = envFallbackProvider();
  if (env) providers.push(env);
  return providers;
}

// Resolve a specific provider by id (falls back to first enabled, then env).
export async function getProvider(providerId?: string): Promise<AiProviderConfig> {
  const providers = await listProviders();
  if (providerId) {
    const found = providers.find((p) => p.id === providerId);
    if (found) return found;
  }
  if (providers.length > 0) return providers[0];
  throw new Error(
    'No AI provider configured. Add one in Settings → AI Providers, or set OPENAI_API_KEY.',
  );
}

function makeClient(cfg: AiProviderConfig): OpenAI {
  return new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl || undefined });
}

// Non-streaming completion for a given provider.
export async function complete(
  messages: ChatMessageIn[],
  providerId?: string,
  model?: string,
): Promise<string> {
  const cfg = await getProvider(providerId);
  const client = makeClient(cfg);
  const res = await client.chat.completions.create({
    model: model ?? cfg.model,
    messages,
  });
  return res.choices[0]?.message?.content ?? '';
}

// Streaming completion. Returns the SDK stream for the caller to pipe to the client.
export async function streamCompletion(
  messages: ChatMessageIn[],
  providerId?: string,
  model?: string,
) {
  const cfg = await getProvider(providerId);
  const client = makeClient(cfg);
  return client.chat.completions.create({
    model: model ?? cfg.model,
    messages,
    stream: true,
  });
}
