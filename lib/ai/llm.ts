import { RAG_CONFIG } from '../config';
import { AppError } from '../errors';
import { getAIProvider } from './provider';
import { StructuredLLMResponse, BookChunk } from '../types';

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

/**
 * Providers say how long to wait. Prefer that over guessing: Gemini returns
 * "Please retry in 1.9s" in the message and sometimes a Retry-After header.
 */
export function retryAfterMs(error: any): number | null {
  const header = error?.headers?.get?.('retry-after') ?? error?.headers?.['retry-after'];
  if (header !== undefined && header !== null) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.ceil(seconds * 1000);
  }
  const match = /retry in ([\d.]+)\s*s/i.exec(String(error?.message ?? ''));
  return match ? Math.ceil(parseFloat(match[1]) * 1000) : null;
}

export function nextDelayMs(error: any, attempt: number, baseDelayMs: number): number {
  const hinted = retryAfterMs(error);
  const backoff = baseDelayMs * Math.pow(2, attempt);
  const chosen = Math.max(hinted ?? backoff, 250);
  return Math.min(chosen, RAG_CONFIG.RETRY_MAX_DELAY_MS) + Math.floor(Math.random() * 250);
}

async function withRetry<T>(
  maxAttempts: number,
  baseDelayMs: number,
  run: () => Promise<T>
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error: any) {
      const isLast = attempt + 1 >= maxAttempts;
      if (isLast || !RETRYABLE_STATUS.has(error?.status)) throw error;
      await new Promise(res => setTimeout(res, nextDelayMs(error, attempt, baseDelayMs)));
    }
  }
}

/**
 * Generates embeddings in batches of 50-100 texts to minimize API overhead.
 * Implements exponential backoff retry handling for rate limits.
 */
export async function generateBatchEmbeddings(
  texts: string[],
  onBatch?: (embedded: number, total: number) => void | Promise<void>,
  maxAttempts: number = RAG_CONFIG.EMBEDDING_MAX_RETRIES
): Promise<number[][]> {
  const { config, client } = getAIProvider();

  const results: number[][] = [];
  const batchSize = RAG_CONFIG.EMBEDDING_BATCH_SIZE;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batchTexts = texts.slice(i, i + batchSize);

    try {
      const vectors = await withRetry(
        maxAttempts,
        RAG_CONFIG.EMBEDDING_RETRY_DELAY_MS,
        async () => {
          const response = await client.embeddings.create({
            model: config.embedModel,
            input: batchTexts,
            dimensions: RAG_CONFIG.EMBEDDING_DIM,
          });
          return response.data.map(d => d.embedding);
        }
      );

      const got = vectors[0]?.length;
      if (got !== RAG_CONFIG.EMBEDDING_DIM) {
        throw new AppError(
          `${config.name}/${config.embedModel} returned ${got}-dim vectors, but the ` +
          `database column is VECTOR(${RAG_CONFIG.EMBEDDING_DIM}). Pick a model that ` +
          `supports that width, or widen the column and the match_book_chunks RPC.`,
          500
        );
      }

      results.push(...vectors);
      await onBatch?.(results.length, texts.length);
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      if (error?.status === 429) {
        const wait = retryAfterMs(error);
        throw Object.assign(
          new AppError(
            `${config.name} rate limit reached while embedding (batch ${Math.floor(i / batchSize) + 1} ` +
            `of ${Math.ceil(texts.length / batchSize)}).`,
            429
          ),
          { retryAfterMs: wait }
        );
      }
      throw new AppError(`${config.name} embeddings failed: ${error?.message ?? error}`, 502);
    }
  }

  return results;
}

/**
 * Generates single embedding for user query.
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const embeddings = await generateBatchEmbeddings([query]);
  return embeddings[0];
}

/**
 * Strict System Prompt for Book-Grounded Question Answering.
 */
const SYSTEM_PROMPT = `You are a book-grounded question answering assistant.

Your job is to answer the user's question using ONLY the supplied excerpts from the selected book.

Rules:
1. Do not use outside knowledge.
2. Do not rely on your pretrained knowledge.
3. Do not guess.
4. Do not invent facts.
5. Do not invent citations.
6. Every factual claim must be supported by the supplied excerpts.
7. Summarize the information naturally instead of copying large portions of the source.
8. Only cite pages that directly support the answer.
9. Keep the answer concise unless the user asks for detail.

When the excerpts do NOT answer the question, do not reply with a bare refusal.
Say specifically what is missing, then say what the relevant excerpts do cover,
and cite those pages. For example, for "who says hello in chapter 2?" when the
excerpts contain Chapter 2 but no greeting:

  "Chapter 2 does not show any character greeting another. It describes the
   keeper of the orchard teaching that every fruit held a lesson about timing
   and care."

Only when the excerpts are about a completely different subject, with nothing
relevant to say, reply exactly:
answer: "I couldn't find enough information about this in the selected book."
citations: []

You MUST respond strictly in valid JSON format matching this JSON schema:
{
  "answer": "Concise natural language answer here...",
  "citations": [
    {
      "page": 15,
      "reason": "Brief rationale for citation"
    }
  ]
}`;

/**
 * Generates a strictly grounded answer from retrieved chunks using OpenAI structured JSON completion.
 */
export async function generateGroundedAnswer(
  bookTitle: string,
  question: string,
  retrievedChunks: BookChunk[]
): Promise<StructuredLLMResponse> {
  if (retrievedChunks.length === 0) {
    return {
      answer: RAG_CONFIG.REFUSAL_RESPONSE,
      citations: []
    };
  }

  const { config, client } = getAIProvider();

  // Format retrieved chunks as context block with page markers
  const contextBlock = retrievedChunks
    .map(c => `--- EXCERPT (Page ${c.page_number}${c.chapter ? `, ${c.chapter}` : ''}) ---\n${c.content}`)
    .join('\n\n');

  const userPrompt = `BOOK TITLE: ${bookTitle}

RETRIEVED EXCERPTS FROM BOOK:
${contextBlock}

USER QUESTION:
${question}`;

  try {
    const content = await withRetry(
      RAG_CONFIG.LLM_MAX_RETRIES,
      RAG_CONFIG.LLM_RETRY_DELAY_MS,
      async () => {
        const response = await client.chat.completions.create({
          model: config.chatModel,
          response_format: { type: 'json_object' },
          temperature: 0.1,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        });
        return response.choices[0]?.message?.content ?? null;
      }
    );

    if (!content) return { answer: RAG_CONFIG.REFUSAL_RESPONSE, citations: [] };

    const parsed: StructuredLLMResponse = JSON.parse(content);
    return {
      answer: parsed.answer || RAG_CONFIG.REFUSAL_RESPONSE,
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
    };
  } catch (error: any) {
    const modelVar = config.name === 'gemini' ? 'GEMINI_LLM_MODEL' : 'OPENAI_LLM_MODEL';

    if (error?.status === 429) {
      const wait = retryAfterMs(error);
      throw new AppError(
        `${config.name} rate limit reached for ${config.chatModel}` +
        (wait ? `; it asked to retry in ${Math.ceil(wait / 1000)}s` : '') +
        `. Quotas are per model - set ${modelVar} to one with more headroom, or enable billing.`,
        429
      );
    }
    if (error?.status === 503) {
      throw new AppError(`${config.name} model ${config.chatModel} is overloaded. Try again shortly.`, 503);
    }
    throw new AppError(`${config.name} answer generation failed: ${error?.message ?? error}`, 502);
  }
}
