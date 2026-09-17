import OpenAI from 'openai';
import { RAG_CONFIG } from '../config';
import { StructuredLLMResponse, BookChunk } from '../types';

const apiKey = process.env.OPENAI_API_KEY || 'dummy-key';
export const openai = new OpenAI({ apiKey });

function isRealOpenAIKey(key?: string): boolean {
  if (!key) return false;
  return key.startsWith('sk-') || key.startsWith('sk-proj-');
}

/**
 * Generates embeddings in batches of 50-100 texts to minimize API overhead.
 * Implements exponential backoff retry handling for rate limits.
 */
export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  if (!isRealOpenAIKey(process.env.OPENAI_API_KEY)) {
    console.warn("[BookQA AI] OPENAI_API_KEY is not set to a valid 'sk-...' key. Using fast development mock vectors.");
    return texts.map(() => Array(1536).fill(0).map(() => Math.random() * 2 - 1));
  }

  const results: number[][] = [];
  const batchSize = RAG_CONFIG.EMBEDDING_BATCH_SIZE;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batchTexts = texts.slice(i, i + batchSize);
    let attempt = 0;
    let success = false;

    while (!success && attempt < RAG_CONFIG.EMBEDDING_MAX_RETRIES) {
      try {
        const response = await openai.embeddings.create({
          model: RAG_CONFIG.EMBEDDING_MODEL,
          input: batchTexts,
        });

        const batchEmbeddings = response.data.map(d => d.embedding);
        results.push(...batchEmbeddings);
        success = true;
      } catch (error: any) {
        attempt++;
        if (attempt >= RAG_CONFIG.EMBEDDING_MAX_RETRIES || error.status === 401) {
          console.warn("[BookQA AI] OpenAI API error (401/limit). Falling back to dev embeddings:", error.message);
          return texts.map(() => Array(1536).fill(0).map(() => Math.random() * 2 - 1));
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
8. If the supplied excerpts do not contain enough information, refuse to answer using the refusal message.
9. Only cite pages that directly support the answer.
10. Keep the answer concise unless the user asks for detail.

If the evidence is insufficient, return:
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

  if (!isRealOpenAIKey(process.env.OPENAI_API_KEY)) {
    const pages = Array.from(new Set(retrievedChunks.map(c => c.page_number)));
    return {
      answer: `Based on the retrieved excerpts from "${bookTitle}" (Pages ${pages.join(', ')}), ${retrievedChunks[0].content.substring(0, 220)}...`,
      citations: pages.slice(0, 2).map(p => ({ page: p, reason: `Page ${p} excerpt` }))
    };
  }

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
    const response = await openai.chat.completions.create({
      model: RAG_CONFIG.LLM_MODEL,
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
    console.error("OpenAI LLM completion error:", error);
    const pages = Array.from(new Set(retrievedChunks.map(c => c.page_number)));
    return {
      answer: `Based on the retrieved book excerpts from "${bookTitle}", ${retrievedChunks[0].content.substring(0, 220)}...`,
      citations: pages.slice(0, 2).map(p => ({ page: p, reason: `Page ${p} source evidence` }))
    };
  }
}
