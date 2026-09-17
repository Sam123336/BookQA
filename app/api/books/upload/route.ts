import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { processBookIngestion, registerMemoryBook } from '@/lib/rag-engine';
import { Book } from '@/lib/types';
import { fsStorePdf } from '@/lib/pdf-cache';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No PDF file uploaded.' }, { status: 400 });
    }

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    if (!isPdf) {
      return NextResponse.json({ error: 'Invalid file format. Please upload a PDF document.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Uploaded PDF file is empty.' }, { status: 400 });
    }

    const title = file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
    const fileName = file.name;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    if (isSupabaseConfigured()) {
      // Create initial DB record in PENDING status immediately
      const { error: dbError } = await supabaseAdmin
        .from('books')
        .insert({
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
        });

      if (dbError) {
        console.warn("Supabase initial DB record note:", dbError.message);
      }
    }

    // Cache local buffer for fast PDF page viewing
    fsStorePdf(id, buffer);

    const bookObj: Book = {
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

    registerMemoryBook(bookObj);

    // Trigger asynchronous ingestion process in background (non-blocking)
    processBookIngestion(id, fileName, buffer).catch(err => {
      console.error(`Async background ingestion error for ${id}:`, err);
    });

    // Return response immediately so upload modal closes and progress bar shows real-time status
    return NextResponse.json({ book: bookObj });
  } catch (error: any) {
    console.error("Upload handler error:", error);
    return NextResponse.json({ error: error.message || 'Failed to process PDF upload.' }, { status: 500 });
  }
}
