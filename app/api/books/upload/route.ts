import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { registerMemoryBook } from '@/lib/rag/store';
import { storePdf, deletePdf, pdfObjectPath } from '@/lib/pdf-cache';
import { RAG_CONFIG } from '@/lib/config';
import { jsonError, routeError } from '@/lib/http';
import { Book } from '@/lib/types';

function newBook(id: string, title: string, fileName: string, now: string): Book {
  return {
    id,
    title,
    author: 'Extracted Document',
    file_name: fileName,
    file_url: '',
    page_count: 0,
    status: 'PENDING',
    total_chunks: 0,
    processed_chunks: 0,
    created_at: now,
    updated_at: now,
  };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return jsonError('No PDF file uploaded.', 400);
    }

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    if (!isPdf) {
      return jsonError('Invalid file format. Please upload a PDF document.', 400);
    }

    if (file.size === 0) {
      return jsonError('Uploaded PDF file is empty.', 400);
    }

    if (file.size > RAG_CONFIG.MAX_UPLOAD_BYTES) {
      const limitMb = Math.round(RAG_CONFIG.MAX_UPLOAD_BYTES / (1024 * 1024));
      return jsonError(`PDF is larger than the ${limitMb}MB upload limit.`, 413);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
    const book = newBook(id, title, file.name, now);

    // The bytes are stored before the row exists. Ingestion re-reads the
    // original on every step, so a book row whose PDF never landed can never be
    // completed - a failed write has to fail the upload, not leave a row behind.
    await storePdf(id, buffer);
    book.file_url = pdfObjectPath(id);

    if (isSupabaseConfigured()) {
      const { error } = await supabaseAdmin.from('books').insert(book);
      if (error) {
        console.error('[books/upload] initial insert failed:', error.message);
        await deletePdf(id);
        return jsonError('Could not create the book record. Please try again.', 500);
      }
    }

    // Ingestion is not started here. The client drives it step by step via
    // POST /api/books/[id]/ingest so no single request has to outlive a
    // serverless time limit.
    registerMemoryBook(book);

    return NextResponse.json({ book });
  } catch (error) {
    return routeError('books/upload', error, 'Failed to process PDF upload.');
  }
}
