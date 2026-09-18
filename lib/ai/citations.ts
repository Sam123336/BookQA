import { BookChunk, Citation, StructuredLLMResponse } from '../types';
import { RAG_CONFIG } from '../config';

/**
 * Validates, deduplicates, and resolves citations against actual retrieved evidence chunks.
 * Strips out any hallucinated page numbers that were not present in the retrieved vector chunks.
 */
export function validateAndDeduplicateCitations(
  llmResponse: StructuredLLMResponse,
  retrievedChunks: BookChunk[]
): Citation[] {
  if (!llmResponse.answer || llmResponse.answer.includes(RAG_CONFIG.REFUSAL_RESPONSE)) {
    return [];
  }

  // 1. Build map of retrieved chunks grouped by page number
  const chunksByPage = new Map<number, BookChunk[]>();
  for (const chunk of retrievedChunks) {
    const existing = chunksByPage.get(chunk.page_number) || [];
    existing.push(chunk);
    chunksByPage.set(chunk.page_number, existing);
  }

  const validCitations: Citation[] = [];
  const seenPages = new Set<number>();

  // 2. Filter LLM citations against retrieved page numbers
  for (const llmCit of llmResponse.citations) {
    const pageNum = Number(llmCit.page);
    if (!pageNum || isNaN(pageNum)) continue;

    // Check if this page was actually in retrieved evidence
    if (chunksByPage.has(pageNum) && !seenPages.has(pageNum)) {
      seenPages.add(pageNum);
      const pageChunks = chunksByPage.get(pageNum)!;
      // Best matching chunk on this page
      const bestChunk = pageChunks[0];

      validCitations.push({
        chunk_id: bestChunk.id || null,
        page_number: pageNum,
        chapter: bestChunk.chapter || '',
        excerpt: bestChunk.content,
        reason: llmCit.reason || `Page ${pageNum} evidence`,
        similarity_score: bestChunk.similarity || 0,
      });
    }
  }

  // 3. Fallback: If LLM produced an answer but omitted explicit citations,
  // append citations for the top 2 highest similarity chunks that pass threshold.
  if (validCitations.length === 0 && retrievedChunks.length > 0) {
    for (const chunk of retrievedChunks.slice(0, 2)) {
      if (!seenPages.has(chunk.page_number)) {
        seenPages.add(chunk.page_number);
        validCitations.push({
          chunk_id: chunk.id || null,
          page_number: chunk.page_number,
          chapter: chunk.chapter || '',
          excerpt: chunk.content,
          reason: `Page ${chunk.page_number} source evidence`,
          similarity_score: chunk.similarity || 0,
        });
      }
    }
  }

  // Sort citations by page number ascending
  return validCitations.sort((a, b) => a.page_number - b.page_number);
}
