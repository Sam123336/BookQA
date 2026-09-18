import { extractTextFromPdf, ScannedPdfError } from '../pdf/extractor';
import { createPageAwareChunks } from '../pdf/chunker';
import { generateBatchEmbeddings } from '../ai/llm';
import { supabaseAdmin, isSupabaseConfigured } from '../supabase';
import { getPdf } from '../pdf-cache';
import { RAG_CONFIG } from '../config';
import { AppError } from '../errors';
import { Book, BookChunk, BookStatus } from '../types';
import { getMemoryBook, getMemoryChunks, setMemoryChunks } from './store';

export type IngestProgress = {
  status: BookStatus;
  processed: number;
  total: number;
  pageCount: number;
  done: boolean;
  retryAfterMs?: number;
  error?: string;
};

/**
 * Advances ingestion by one bounded step and returns.
 *
 * Every piece of state lives in the database, never in the process, so a step
 * can run on a fresh instance, an interrupted book resumes on the next call,
 * and no single invocation outlives a serverless time limit. The caller drives
 * it by polling until `done`.
 */
export async function advanceIngestion(bookId: string): Promise<IngestProgress> {
  const book = await loadBook(bookId);
  if (!book) throw new AppError('Book not found.', 404);

  try {
    switch (book.status) {
      case 'COMPLETED':
        return finished(book);
      case 'FAILED':
        return { ...finished(book), error: book.error_message ?? 'Ingestion failed.' };
      case 'PENDING':
      case 'EXTRACTING':
      case 'INDEXING':
        return await storeNextChunks(book);
      default:
        return await embedNextSlice(book);
    }
  } catch (error: any) {
    if (error?.status === 429) {
      return {
        status: 'EMBEDDING',
        processed: book.processed_chunks,
        total: book.total_chunks,
        pageCount: book.page_count,
        done: false,
        retryAfterMs: error.retryAfterMs ?? RAG_CONFIG.LLM_RETRY_DELAY_MS,
      };
    }

    const message = error instanceof ScannedPdfError ? error.message : (error?.message ?? String(error));
    await updateBook(bookId, { status: 'FAILED', error_message: message });
    return {
      status: 'FAILED', processed: 0, total: 0, pageCount: book.page_count, done: true, error: message,
    };
  }
}

async function storeNextChunks(book: Book): Promise<IngestProgress> {
  const pdf = getPdf(book.id);
  if (!pdf) {
    throw new AppError('The uploaded PDF is no longer available. Please upload it again.', 410);
  }

  if (book.status === 'PENDING') await updateBook(book.id, { status: 'EXTRACTING' });

  const pages = await extractTextFromPdf(pdf);
  const chunks = createPageAwareChunks(book.id, pages);
  if (chunks.length === 0) {
    throw new AppError('No readable text could be extracted from this PDF.', 422);
  }

  const stored = await countChunks(book.id);

  // Text is written before any vectors exist. That is what makes the work
  // resumable, and it is the indexing the progress bar reports.
  if (stored < chunks.length) {
    const next = chunks.slice(stored, stored + RAG_CONFIG.CHUNK_INSERT_BATCH);
    await storeChunks(book.id, next);
    const nowStored = stored + next.length;

    await updateBook(book.id, {
      status: 'INDEXING',
      page_count: pages.length,
      total_chunks: chunks.length,
      processed_chunks: nowStored,
    });

    return {
      status: 'INDEXING',
      processed: nowStored,
      total: chunks.length,
      pageCount: pages.length,
      done: false,
    };
  }

  await updateBook(book.id, {
    status: 'EMBEDDING',
    page_count: pages.length,
    total_chunks: chunks.length,
    processed_chunks: 0,
  });

  return {
    status: 'EMBEDDING', processed: 0, total: chunks.length, pageCount: pages.length, done: false,
  };
}

async function embedNextSlice(book: Book): Promise<IngestProgress> {
  const pending = await pendingChunks(book.id, RAG_CONFIG.EMBEDDING_BATCH_SIZE);

  if (pending.length === 0) {
    // Nothing pending can also mean nothing was ever stored - a book left
    // mid-flight by an older build, or an interrupted extract. Completing here
    // would mark an empty book ready, so re-run extraction instead.
    const stored = await countChunks(book.id);
    if (stored === 0) return await storeNextChunks(book);

    await updateBook(book.id, {
      status: 'COMPLETED',
      processed_chunks: book.total_chunks,
      error_message: null,
    });
    return {
      status: 'COMPLETED',
      processed: book.total_chunks,
      total: book.total_chunks,
      pageCount: book.page_count,
      done: true,
    };
  }

  // One attempt only: a rate limit must come back as state for the caller to
  // retry, not as a long sleep inside a request.
  const vectors = await generateBatchEmbeddings(pending.map(c => c.content), undefined, 1);
  await saveEmbeddings(book.id, pending, vectors);

  const remaining = await countPendingChunks(book.id);
  const processed = book.total_chunks - remaining;
  await updateBook(book.id, { processed_chunks: processed });

  return {
    status: 'EMBEDDING',
    processed,
    total: book.total_chunks,
    pageCount: book.page_count,
    done: false,
  };
}

function finished(book: Book): IngestProgress {
  return {
    status: book.status,
    processed: book.processed_chunks,
    total: book.total_chunks,
    pageCount: book.page_count,
    done: true,
  };
}

async function loadBook(bookId: string): Promise<Book | null> {
  if (!isSupabaseConfigured()) return getMemoryBook(bookId) ?? null;
  const { data, error } = await supabaseAdmin.from('books').select('*').eq('id', bookId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Book) ?? null;
}

async function updateBook(bookId: string, fields: Partial<Book>) {
  const patch = { ...fields, updated_at: new Date().toISOString() };
  if (!isSupabaseConfigured()) {
    const book = getMemoryBook(bookId);
    if (book) Object.assign(book, patch);
    return;
  }
  const { error } = await supabaseAdmin.from('books').update(patch).eq('id', bookId);
  if (error) throw new Error(error.message);
}

async function countChunks(bookId: string): Promise<number> {
  if (!isSupabaseConfigured()) return getMemoryChunks(bookId).length;
  const { count, error } = await supabaseAdmin
    .from('book_chunks').select('id', { count: 'exact', head: true }).eq('book_id', bookId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countPendingChunks(bookId: string): Promise<number> {
  if (!isSupabaseConfigured()) {
    return getMemoryChunks(bookId).filter(c => !c.embedding?.length).length;
  }
  const { count, error } = await supabaseAdmin
    .from('book_chunks').select('id', { count: 'exact', head: true })
    .eq('book_id', bookId).is('embedding', null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function pendingChunks(bookId: string, limit: number): Promise<BookChunk[]> {
  if (!isSupabaseConfigured()) {
    return getMemoryChunks(bookId).filter(c => !c.embedding?.length).slice(0, limit);
  }
  const { data, error } = await supabaseAdmin
    .from('book_chunks').select('id, content, chunk_index')
    .eq('book_id', bookId).is('embedding', null)
    .order('chunk_index').limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as BookChunk[];
}

async function storeChunks(bookId: string, chunks: BookChunk[]) {
  if (!isSupabaseConfigured()) {
    setMemoryChunks(bookId, [...getMemoryChunks(bookId), ...chunks]);
    return;
  }
  const size = 100;
  for (let i = 0; i < chunks.length; i += size) {
    const rows = chunks.slice(i, i + size).map(c => ({
      book_id: bookId,
      page_number: c.page_number,
      chapter: c.chapter || '',
      section: c.section || '',
      chunk_index: c.chunk_index,
      content: c.content,
      embedding: null,
    }));
    const { error } = await supabaseAdmin.from('book_chunks').insert(rows);
    if (error) throw new Error(`Chunk insert failed: ${error.message}`);
  }
}

async function saveEmbeddings(bookId: string, chunks: BookChunk[], vectors: number[][]) {
  if (!isSupabaseConfigured()) {
    const all = getMemoryChunks(bookId);
    chunks.forEach((chunk, i) => {
      const target = all.find(c => c.chunk_index === chunk.chunk_index);
      if (target) target.embedding = vectors[i];
    });
    setMemoryChunks(bookId, all);
    return;
  }
  for (let i = 0; i < chunks.length; i++) {
    const { error } = await supabaseAdmin
      .from('book_chunks').update({ embedding: vectors[i] }).eq('id', chunks[i].id);
    if (error) throw new Error(`Embedding write failed: ${error.message}`);
  }
}
