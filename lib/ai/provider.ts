import OpenAI from 'openai';
import { RAG_CONFIG } from '../config';
import { AppError } from '../errors';

export type ProviderName = 'openai' | 'gemini';

export type ProviderConfig = {
  name: ProviderName;
  apiKey: string;
  baseURL?: string;
  embedModel: string;
  chatModel: string;
  minSimilarity: number;
};

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

const GEMINI_DEFAULTS = {
  embedModel: 'gemini-embedding-001',
  chatModel: 'gemini-3.5-flash',
  minSimilarity: 0.55,
};

const OPENAI_DEFAULTS = {
  embedModel: RAG_CONFIG.EMBEDDING_MODEL,
  chatModel: RAG_CONFIG.LLM_MODEL,
  minSimilarity: 0.35,
};

function num(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback; // Number('') is 0
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function gemini(apiKey: string, env: Record<string, string | undefined>): ProviderConfig {
  return {
    name: 'gemini',
    apiKey,
    baseURL: GEMINI_BASE_URL,
    embedModel: env.GEMINI_EMBEDDING_MODEL || GEMINI_DEFAULTS.embedModel,
    chatModel: env.GEMINI_LLM_MODEL || GEMINI_DEFAULTS.chatModel,
    minSimilarity: num(env.MIN_SIMILARITY, GEMINI_DEFAULTS.minSimilarity),
  };
}

function openai(apiKey: string, env: Record<string, string | undefined>): ProviderConfig {
  const baseURL = env.OPENAI_BASE_URL || undefined;

  if (!baseURL && !apiKey.startsWith('sk-')) {
    throw new AppError(
      `OPENAI_API_KEY does not look like an OpenAI key (expected 'sk-...', got '${apiKey.slice(0, 6)}...'). ` +
      `If this is a Gemini key, set GEMINI_API_KEY instead and leave OPENAI_API_KEY empty. ` +
      `If it is a proxy or Azure key, set OPENAI_BASE_URL too.`,
      500
    );
  }

  return {
    name: 'openai',
    apiKey,
    baseURL,
    embedModel: env.OPENAI_EMBEDDING_MODEL || OPENAI_DEFAULTS.embedModel,
    chatModel: env.OPENAI_LLM_MODEL || OPENAI_DEFAULTS.chatModel,
    minSimilarity: num(env.MIN_SIMILARITY, OPENAI_DEFAULTS.minSimilarity),
  };
}

export function resolveProvider(env: Record<string, string | undefined>): ProviderConfig {
  const openaiKey = env.OPENAI_API_KEY?.trim();
  const geminiKey = (env.GEMINI_API_KEY || env.GOOGLE_API_KEY)?.trim();
  const forced = env.AI_PROVIDER?.trim().toLowerCase() as ProviderName | undefined;

  const wantGemini = forced ? forced === 'gemini' : !openaiKey && !!geminiKey;

  if (wantGemini) {
    if (!geminiKey) throw new AppError('GEMINI_API_KEY is not set.', 500);
    return gemini(geminiKey, env);
  }

  if (!openaiKey) {
    throw new AppError('No AI key found. Set OPENAI_API_KEY (sk-...) or GEMINI_API_KEY in .env.', 500);
  }
  return openai(openaiKey, env);
}

let cached: { config: ProviderConfig; client: OpenAI } | null = null;

export function getAIProvider(): { config: ProviderConfig; client: OpenAI } {
  if (!cached) {
    const config = resolveProvider(process.env);
    cached = {
      config,
      client: new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL }),
    };
  }
  return cached;
}
