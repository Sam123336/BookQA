import { extractTextFromPdf, ScannedPdfError } from '../pdf/extractor';
import { createPageAwareChunks } from '../pdf/chunker';
import { generateBatchEmbeddings } from '../ai/llm';
import { supabaseAdmin, isSupabaseConfigured } from '../supabase';
import { Book, BookStatus } from '../types';
import { getMemoryBook, setMemoryChunks } from './store';

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
      setMemoryChunks(bookId, chunks);
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
    const book = getMemoryBook(bookId);
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
    const book = getMemoryBook(bookId);
    if (book) {
      Object.assign(book, fields);
    }
  }
}
