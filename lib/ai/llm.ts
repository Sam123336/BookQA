import { RAG_CONFIG } from '../config';
import { AppError } from '../errors';
import { getAIProvider } from './provider';
import { StructuredLLMResponse, BookChunk } from '../types';

/**
 * Generates embeddings in batches of 50-100 texts to minimize API overhead.
 * Implements exponential backoff retry handling for rate limits.
 */
export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  const { config, client } = getAIProvider();

  const results: number[][] = [];
  const batchSize = RAG_CONFIG.EMBEDDING_BATCH_SIZE;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batchTexts = texts.slice(i, i + batchSize);
    let attempt = 0;
    let success = false;

    while (!success && attempt < RAG_CONFIG.EMBEDDING_MAX_RETRIES) {
      try {
        const response = await client.embeddings.create({
          model: config.embedModel,
          input: batchTexts,
          dimensions: RAG_CONFIG.EMBEDDING_DIM,
        });

        const batchEmbeddings = response.data.map(d => d.embedding);
        const got = batchEmbeddings[0]?.length;
        if (got !== RAG_CONFIG.EMBEDDING_DIM) {
          throw Object.assign(
            new Error(
              `${config.name}/${config.embedModel} returned ${got}-dim vectors, but the ` +
              `database column is VECTOR(${RAG_CONFIG.EMBEDDING_DIM}). Pick a model that ` +
              `supports that width, or widen the column and the match_book_chunks RPC.`
            ),
            { status: 400 }
          );
        }
        results.push(...batchEmbeddings);
        success = true;
      } catch (error: any) {
        attempt++;
        if (attempt >= RAG_CONFIG.EMBEDDING_MAX_RETRIES || error.status === 401 || error.status === 400) {
          throw new Error(`${config.name} embeddings failed: ${error.message}`);
        }
        // Exponential backoff wait
        const delay = RAG_CONFIG.EMBEDDING_RETRY_DELAY_MS * Math.pow(2, attempt);
        await new Promise(res => setTimeout(res, delay));
      }
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

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: config.chatModel,
        response_format: { type: "json_object" },
        temperature: 0.1, // Low temperature for high factual precision
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return { answer: RAG_CONFIG.REFUSAL_RESPONSE, citations: [] };
      }

      const parsed: StructuredLLMResponse = JSON.parse(content);
      return {
        answer: parsed.answer || RAG_CONFIG.REFUSAL_RESPONSE,
        citations: Array.isArray(parsed.citations) ? parsed.citations : []
      };
    } catch (error: any) {
      const retryable = error.status === 429 || error.status === 503;
      if (!retryable || attempt + 1 >= RAG_CONFIG.LLM_MAX_RETRIES) {
        if (error.status === 429) {
          throw new AppError(
            `${config.name} rate limit reached (429) for ${config.chatModel}. ` +
            `Free-tier quotas are per-minute - wait a moment and ask again, or set ` +
            `${config.name === 'gemini' ? 'GEMINI_LLM_MODEL' : 'OPENAI_LLM_MODEL'} to a model with more headroom.`
          );
        }
        if (error.status === 503) {
          throw new AppError(`${config.name} model ${config.chatModel} is overloaded (503). Try again shortly.`, 503);
        }
        throw new Error(`${config.name} answer generation failed: ${error.message}`);
      }
      await new Promise(res => setTimeout(res, RAG_CONFIG.LLM_RETRY_DELAY_MS * Math.pow(2, attempt)));
    }
  }
}
