import OpenAI from 'openai';
import { RAG_CONFIG } from '../config';
import { AppError } from '../errors';

export type ProviderName = 'openai' | 'gemini' | 'groq';

// Which half of the pipeline is asking. They can be different providers: Groq
// serves chat but has no /embeddings endpoint, so vectors come from elsewhere.
export type Role = 'chat' | 'embed';

export type ProviderConfig = {
  name: ProviderName;
  apiKey: string;
  baseURL?: string;
  embedModel: string;
  chatModel: string;
  minSimilarity: number;
};

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

// Gemini returns errors as a JSON *array* ([{error:{...}}]), which the OpenAI SDK
// cannot parse - every failure arrives as "429 status code (no body)" with the
// real message and its retry hint discarded. Unwrap it into the object shape the
// SDK expects so callers can read both.
const unwrapGeminiError: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (res.ok) return res;

  const body = await res.text();
  let payload = body;
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed) && parsed[0]?.error) payload = JSON.stringify(parsed[0]);
  } catch {
    // not JSON; pass the original body through untouched
  }

  return new Response(payload, {
    status: res.status,
    statusText: res.statusText,
    headers: { 'content-type': 'application/json' },
  });
};

const GEMINI_DEFAULTS = {
  embedModel: 'gemini-embedding-001',
  chatModel: 'gemini-3.5-flash',
  minSimilarity: 0.55,
};

const GROQ_DEFAULTS = {
  chatModel: 'openai/gpt-oss-120b',
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

// Groq is only ever resolved for chat, so embedModel and minSimilarity are never
// read off this config - the embed provider owns both.
function groq(apiKey: string, env: Record<string, string | undefined>): ProviderConfig {
  return {
    name: 'groq',
    apiKey,
    baseURL: GROQ_BASE_URL,
    embedModel: '',
    chatModel: env.GROQ_LLM_MODEL || GROQ_DEFAULTS.chatModel,
    minSimilarity: 0,
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

export function resolveProvider(
  env: Record<string, string | undefined>,
  role: Role = 'chat',
  only?: ProviderName
): ProviderConfig {
  const openaiKey = env.OPENAI_API_KEY?.trim();
  const geminiKey = (env.GEMINI_API_KEY || env.GOOGLE_API_KEY)?.trim();
  const groqKey = env.GROQ_API_KEY?.trim();
  // `only` is the reader's pick for this one request; AI_PROVIDER is the default.
  const forced = only ?? (env.AI_PROVIDER?.trim().toLowerCase() as ProviderName | undefined);

  // Groq has no /embeddings endpoint, so it can only serve chat. Embedding
  // ignores it and falls through, which is what makes a Groq-for-answers,
  // Gemini-for-vectors setup work from one .env.
  if (role === 'chat' && (forced === 'groq' || (!forced && !!groqKey))) {
    if (!groqKey) throw new AppError('AI_PROVIDER=groq but GROQ_API_KEY is not set.', 500);
    return groq(groqKey, env);
  }

  const wantGemini =
    forced && forced !== 'groq' ? forced === 'gemini' : !openaiKey && !!geminiKey;

  if (wantGemini) {
    if (!geminiKey) throw new AppError('GEMINI_API_KEY is not set.', 500);
    return gemini(geminiKey, env);
  }

  if (!openaiKey) {
    throw new AppError(
      role === 'embed'
        ? 'No embedding provider found. Groq has no embeddings endpoint, so set ' +
          'GEMINI_API_KEY or OPENAI_API_KEY (sk-...) alongside GROQ_API_KEY.'
        : 'No AI key found. Set GROQ_API_KEY, OPENAI_API_KEY (sk-...) or GEMINI_API_KEY in .env.',
      500
    );
  }
  return openai(openaiKey, env);
}

/**
 * Every chat provider whose key is present and resolvable, for the model picker.
 * A key that cannot resolve (wrong shape, missing companion setting) is left out
 * rather than offered and then failing on the first question.
 */
export function availableChatProviders(
  env: Record<string, string | undefined>
): { name: ProviderName; model: string; label: string }[] {
  const keyed: [ProviderName, string | undefined][] = [
    ['groq', env.GROQ_API_KEY],
    ['openai', env.OPENAI_API_KEY],
    ['gemini', env.GEMINI_API_KEY || env.GOOGLE_API_KEY],
  ];

  return keyed.flatMap(([name, key]) => {
    if (!key?.trim()) return [];
    try {
      const { chatModel } = resolveProvider(env, 'chat', name);
      // Model ids carry a vendor prefix on some providers ('openai/gpt-oss-120b').
      return [{ name, model: chatModel, label: `${chatModel.split('/').pop()} · ${name}` }];
    } catch {
      return [];
    }
  });
}

const cache = new Map<string, { config: ProviderConfig; client: OpenAI }>();

export function getAIProvider(
  role: Role = 'chat',
  only?: ProviderName
): { config: ProviderConfig; client: OpenAI } {
  const key = `${role}:${only ?? ''}`;
  let entry = cache.get(key);
  if (!entry) {
    const config = resolveProvider(process.env, role, only);
    entry = {
      config,
      client: new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        maxRetries: 0,
        fetch: config.name === 'gemini' ? unwrapGeminiError : undefined,
      }),
    };
    cache.set(key, entry);
  }
  return entry;
}
