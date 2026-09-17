import { ExtractedPage, BookChunk } from '../types';
import { RAG_CONFIG } from '../config';

/**
 * Creates page-aware chunks from extracted PDF pages.
 * Ensures every chunk strictly retains its source page number and metadata.
 */
export function createPageAwareChunks(
  bookId: string,
  pages: ExtractedPage[],
  chunkSize: number = RAG_CONFIG.CHUNK_SIZE,
  chunkOverlap: number = RAG_CONFIG.CHUNK_OVERLAP
): BookChunk[] {
  const allChunks: BookChunk[] = [];
  let globalChunkIndex = 0;

  for (const page of pages) {
    const pageText = page.text.trim();
    if (!pageText) continue;

    // If page text is smaller than chunk size, treat whole page as 1 chunk
    if (pageText.length <= chunkSize) {
      allChunks.push({
        book_id: bookId,
        page_number: page.pageNumber,
        chapter: extractChapterHeader(pageText),
        section: '',
        chunk_index: globalChunkIndex++,
        content: pageText,
      });
      continue;
    }

    // Split page text using paragraph / sentence boundary aware sliding window
    const pageChunks = splitTextWithOverlap(pageText, chunkSize, chunkOverlap);

    for (const chunkContent of pageChunks) {
      if (chunkContent.trim().length > 10) {
        allChunks.push({
          book_id: bookId,
          page_number: page.pageNumber,
          chapter: extractChapterHeader(pageText),
          section: '',
          chunk_index: globalChunkIndex++,
          content: chunkContent.trim(),
        });
      }
    }
  }

  return allChunks;
}

/**
 * Helper to split text using paragraph and sentence boundaries with overlap.
 */
function splitTextWithOverlap(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + size;

    if (endIndex < text.length) {
      // Find clean natural boundary (paragraph break, sentence end, or clause break)
      const paragraphBoundary = text.lastIndexOf('\n\n', endIndex);
      const periodBoundary = text.lastIndexOf('. ', endIndex);
      const newlineBoundary = text.lastIndexOf('\n', endIndex);

      if (paragraphBoundary > startIndex + Math.floor(size / 2)) {
        endIndex = paragraphBoundary + 2;
      } else if (periodBoundary > startIndex + Math.floor(size / 2)) {
        endIndex = periodBoundary + 2;
      } else if (newlineBoundary > startIndex + Math.floor(size / 2)) {
        endIndex = newlineBoundary + 1;
      }
    } else {
      endIndex = text.length;
    }

    const chunkStr = text.substring(startIndex, endIndex).trim();
    if (chunkStr) {
      chunks.push(chunkStr);
    }

    if (endIndex >= text.length) break;

    // Advance sliding window with overlap
    startIndex = Math.max(startIndex + 1, endIndex - overlap);
  }

  return chunks;
}

/**
 * Extracts potential Chapter header patterns from text (e.g. "Chapter 1", "CHAPTER IV", etc.)
 */
function extractChapterHeader(text: string): string {
  const match = text.match(/(?:CHAPTER|Chapter|PART|Part)\s+([0-9IVXLCDM]+|[A-Za-z\s]{2,30})/);
  return match ? match[0].trim() : '';
}
