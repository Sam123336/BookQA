import { extractTextFromPdf, ScannedPdfError } from './pdf/extractor';
import { createPageAwareChunks } from './pdf/chunker';
import { generateBatchEmbeddings, generateQueryEmbedding, generateGroundedAnswer } from './ai/openai';
import { validateAndDeduplicateCitations } from './ai/citations';
import { supabaseAdmin, isSupabaseConfigured } from './supabase';
import { RAG_CONFIG } from './config';
import { Book, BookChunk, Citation, BookStatus } from './types';

// In-memory fallback store for local development without active Supabase credentials
const memoryBooks = new Map<string, Book>();
const memoryChunks = new Map<string, BookChunk[]>();

export function getMemoryBooks(): Book[] {
  return Array.from(memoryBooks.values());
}

export function getMemoryBook(id: string): Book | undefined {
  return memoryBooks.get(id);
}

export function deleteMemoryBook(id: string): boolean {
  memoryChunks.delete(id);
  return memoryBooks.delete(id);
}

/**
 * Execute full PDF ingestion pipeline asynchronously in background:
 * Storage Upload -> Page Extraction -> Page-Aware Chunks -> Batch Embeddings -> Database Store
 */
export async function processBookIngestion(
  bookId: string,
  fileName: string,
  pdfBuffer: Buffer,
  onProgress?: (processed: number, total: number, status: BookStatus) => void
): Promise<void> {
  try {
    // Optional Supabase storage upload in background
    if (isSupabaseConfigured()) {
      try {
        const storagePath = `${bookId}/${fileName}`;
        const { data: publicUrlData } = supabaseAdmin.storage.from('books').getPublicUrl(storagePath);
        const fileUrl = publicUrlData?.publicUrl || '';

        await supabaseAdmin.storage
          .from('books')
          .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });

        await updateBookFields(bookId, { file_url: fileUrl });
      } catch (stgErr) {
        console.warn("Supabase storage background upload note:", stgErr);
      }
    }

    // 1. Update status to EXTRACTING
    await updateBookStatus(bookId, 'EXTRACTING', 0, 0);
    if (onProgress) onProgress(0, 0, 'EXTRACTING');

    // 2. Extract page-by-page text
    const pages = await extractTextFromPdf(pdfBuffer);
    
    // Update page count in DB
    await updateBookFields(bookId, { page_count: pages.length });

    // 3. Create page-aware chunks
    const chunks = createPageAwareChunks(bookId, pages);
    const totalChunks = chunks.length;

    if (totalChunks === 0) {
      throw new Error("No readable text chunks could be extracted from this PDF.");
    }

    await updateBookStatus(bookId, 'EMBEDDING', 0, totalChunks);
    if (onProgress) onProgress(0, totalChunks, 'EMBEDDING');

    // 4. Batch Embedding Generation
    const chunkTexts = chunks.map(c => c.content);
    const embeddings = await generateBatchEmbeddings(chunkTexts);

    // Attach embeddings to chunks
    for (let i = 0; i < chunks.length; i++) {
      chunks[i].embedding = embeddings[i];
    }

    // 5. Indexing / Database Insertion
    await updateBookStatus(bookId, 'INDEXING', 0, totalChunks);
    if (onProgress) onProgress(0, totalChunks, 'INDEXING');

    if (isSupabaseConfigured()) {
      // Batch insert into Supabase in groups of 100
      const dbBatchSize = 100;
      for (let i = 0; i < chunks.length; i += dbBatchSize) {
        const batch = chunks.slice(i, i + dbBatchSize).map(c => ({
          book_id: c.book_id,
          page_number: c.page_number,
          chapter: c.chapter || '',
          section: c.section || '',
          chunk_index: c.chunk_index,
          content: c.content,
          embedding: c.embedding,
        }));

        const { error } = await supabaseAdmin.from('book_chunks').insert(batch);
        if (error) throw new Error(`Database batch insert error: ${error.message}`);

        const processedCount = Math.min(i + dbBatchSize, totalChunks);
        await updateBookStatus(bookId, 'INDEXING', processedCount, totalChunks);
        if (onProgress) onProgress(processedCount, totalChunks, 'INDEXING');
      }
    } else {
      // Store in memory fallback
      memoryChunks.set(bookId, chunks);
    }

    // 6. Complete Ingestion
    await updateBookStatus(bookId, 'COMPLETED', totalChunks, totalChunks);
    if (onProgress) onProgress(totalChunks, totalChunks, 'COMPLETED');

  } catch (error: any) {
    const errorMsg = error instanceof ScannedPdfError ? error.message : (error.message || String(error));
    console.error(`Ingestion error for book ${bookId}:`, errorMsg);
    await updateBookStatus(bookId, 'FAILED', 0, 0, errorMsg);
    if (onProgress) onProgress(0, 0, 'FAILED');
    throw error;
  }
}

/**
 * Performs vector similarity search and grounded LLM answer generation.
 */
export async function queryBookQuestion(
  bookId: string,
  bookTitle: string,
  question: string
): Promise<{
  answer: string;
  citations: Citation[];
  grounded: boolean;
  retrievedChunksCount: number;
}> {
  // 1. Generate query embedding
  const queryEmbedding = await generateQueryEmbedding(question);

  // 2. Perform Vector Search
  let relevantChunks: BookChunk[] = [];

  if (isSupabaseConfigured()) {
    const { data, error } = await supabaseAdmin.rpc('match_book_chunks', {
      query_embedding: queryEmbedding,
      match_book_id: bookId,
      match_threshold: RAG_CONFIG.MIN_SIMILARITY,
      match_count: RAG_CONFIG.TOP_K,
    });

    if (error) {
      console.error("Vector RPC match error:", error);
    } else if (data) {
      relevantChunks = data.map((d: any) => ({
        id: d.id,
        book_id: d.book_id,
        page_number: d.page_number,
        chapter: d.chapter,
        section: d.section,
        chunk_index: d.chunk_index,
        content: d.content,
        similarity: d.similarity,
      }));
    }
  } else {
    // Memory fallback cosine similarity match
    const chunks = memoryChunks.get(bookId) || [];
    const scored = chunks.map(chunk => {
      const sim = cosineSimilarity(queryEmbedding, chunk.embedding || []);
      return { ...chunk, similarity: sim };
    });

    relevantChunks = scored
      .filter(c => (c.similarity || 0) >= RAG_CONFIG.MIN_SIMILARITY)
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, RAG_CONFIG.TOP_K);
  }

  // 3. Evaluate evidence availability
  if (relevantChunks.length === 0) {
    return {
      answer: RAG_CONFIG.REFUSAL_RESPONSE,
      citations: [],
      grounded: false,
      retrievedChunksCount: 0,
    };
  }

  // 4. Generate grounded LLM response
  const llmResponse = await generateGroundedAnswer(bookTitle, question, relevantChunks);

  // 5. Validate & deduplicate citations
  const verifiedCitations = validateAndDeduplicateCitations(llmResponse, relevantChunks);
  const isGrounded = verifiedCitations.length > 0 && !llmResponse.answer.includes("couldn't find enough information");

  return {
    answer: llmResponse.answer,
    citations: verifiedCitations,
    grounded: isGrounded,
    retrievedChunksCount: relevantChunks.length,
  };
}

// Database helper functions
async function updateBookStatus(
  bookId: string,
  status: BookStatus,
  processed: number,
  total: number,
  errorMessage: string | null = null
) {
  if (isSupabaseConfigured()) {
    await supabaseAdmin.from('books').update({
      status,
      processed_chunks: processed,
      total_chunks: total,
      error_message: errorMessage,
      updated_at: new Date().toISOString()
    }).eq('id', bookId);
  } else {
    const book = memoryBooks.get(bookId);
    if (book) {
      book.status = status;
      book.processed_chunks = processed;
      book.total_chunks = total;
      book.error_message = errorMessage;
      book.updated_at = new Date().toISOString();
    }
  }
}

async function updateBookFields(bookId: string, fields: Partial<Book>) {
  if (isSupabaseConfigured()) {
    await supabaseAdmin.from('books').update({
      ...fields,
      updated_at: new Date().toISOString()
    }).eq('id', bookId);
  } else {
    const book = memoryBooks.get(bookId);
    if (book) {
      Object.assign(book, fields);
    }
  }
}

export function registerMemoryBook(book: Book) {
  memoryBooks.set(book.id, book);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
