import { generateQueryEmbedding, generateGroundedAnswer } from '../ai/llm';
import { getAIProvider } from '../ai/provider';
import { validateAndDeduplicateCitations } from '../ai/citations';
import { supabaseAdmin, isSupabaseConfigured } from '../supabase';
import { RAG_CONFIG } from '../config';
import { BookChunk, Citation } from '../types';
import { getMemoryChunks, cosineSimilarity } from './store';

export const SUMMARY_RE =
  /\b(sum+ar\w*|overview|tl;?dr|abstract|synopsis|key\s+(points|takeaways)|main\s+(ideas|points|themes))\b|what\s+is\s+(this|the)\s+book\s+about/i;

export const CHITCHAT_RE =
  /^\s*(hi+|hey+|hello+|yo|hiya|howdy|sup|greetings|thanks|thank you|thanx|thx|ty|ok|okay|k|cool|nice|great|good\s+(morning|afternoon|evening|night)|bye|goodbye|see\s+ya)[\s!.?,]*$/i;

export const SUMMARY_PROMPT =
  'Summarize this book using the supplied excerpts. Cover its main ideas and themes.';

const NO_THRESHOLD = -1;

export type AnswerResult = {
  answer: string;
  citations: Citation[];
  grounded: boolean;
  retrievedChunksCount: number;
};

function refusal(): AnswerResult {
  return {
    answer: RAG_CONFIG.REFUSAL_RESPONSE,
    citations: [],
    grounded: false,
    retrievedChunksCount: 0,
  };
}

export function strideSample<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  const step = items.length / limit;
  return Array.from({ length: limit }, (_, i) => items[Math.floor(i * step)]);
}

async function searchChunks(
  bookId: string,
  queryEmbedding: number[],
  threshold: number,
  limit: number
): Promise<BookChunk[]> {
  if (!isSupabaseConfigured()) {
    return getMemoryChunks(bookId)
      .map(chunk => ({ ...chunk, similarity: cosineSimilarity(queryEmbedding, chunk.embedding || []) }))
      .filter(chunk => (chunk.similarity || 0) >= threshold)
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, limit);
  }

  const { data, error } = await supabaseAdmin.rpc('match_book_chunks', {
    query_embedding: queryEmbedding,
    match_book_id: bookId,
    match_threshold: threshold,
    match_count: limit,
  });
  if (error) throw new Error(`Vector search failed: ${error.message}`);
  return (data || []) as BookChunk[];
}

async function coverageChunks(bookId: string, limit: number): Promise<BookChunk[]> {
  if (!isSupabaseConfigured()) {
    return strideSample(getMemoryChunks(bookId), limit);
  }

  const { data, error } = await supabaseAdmin
    .from('book_chunks')
    .select('id, book_id, page_number, chapter, section, chunk_index, content')
    .eq('book_id', bookId)
    .order('chunk_index');
  if (error) throw new Error(`Coverage fetch failed: ${error.message}`);
  return strideSample((data || []) as BookChunk[], limit);
}

async function answerFrom(
  bookTitle: string,
  prompt: string,
  chunks: BookChunk[]
): Promise<AnswerResult> {
  if (chunks.length === 0) return refusal();

  const response = await generateGroundedAnswer(bookTitle, prompt, chunks);
  const citations = validateAndDeduplicateCitations(response, chunks);

  return {
    answer: response.answer,
    citations,
    grounded: citations.length > 0,
    retrievedChunksCount: chunks.length,
  };
}

function greeting(bookTitle: string): AnswerResult {
  return {
    answer: `Ask me anything about "${bookTitle}" and I'll answer from the book, with the pages cited.`,
    citations: [],
    grounded: false,
    retrievedChunksCount: 0,
  };
}

async function answerBySearch(
  bookId: string,
  bookTitle: string,
  question: string
): Promise<AnswerResult> {
  const embedding = await generateQueryEmbedding(question);
  const { minSimilarity } = getAIProvider().config;

  const confident = await searchChunks(bookId, embedding, minSimilarity, RAG_CONFIG.TOP_K);
  const chunks = confident.length > 0
    ? confident
    : await searchChunks(bookId, embedding, NO_THRESHOLD, RAG_CONFIG.TOP_K);

  return answerFrom(bookTitle, question, chunks);
}

export async function queryBookQuestion(
  bookId: string,
  bookTitle: string,
  question: string
): Promise<AnswerResult> {
  if (CHITCHAT_RE.test(question)) {
    return greeting(bookTitle);
  }

  if (SUMMARY_RE.test(question)) {
    return answerFrom(bookTitle, SUMMARY_PROMPT, await coverageChunks(bookId, RAG_CONFIG.SUMMARY_CHUNKS));
  }

  return answerBySearch(bookId, bookTitle, question);
}
