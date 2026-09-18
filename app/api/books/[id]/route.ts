import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getMemoryBook, deleteMemoryBook } from '@/lib/rag/store';
import { deletePdf } from '@/lib/pdf-cache';
import { jsonError, routeError } from '@/lib/http';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabaseAdmin
        .from('books')
        .select('*')
        .eq('id', id)
        .single();

      if (!error && data) {
        return NextResponse.json({ book: data });
      }
    }

    const memBook = getMemoryBook(id);
    if (memBook) {
      return NextResponse.json({ book: memBook });
    }

    return jsonError('Book not found', 404);
  } catch (error) {
    return routeError('books/[id] GET', error, 'Failed to fetch book');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    if (isSupabaseConfigured()) {
      const { error } = await supabaseAdmin.from('books').delete().eq('id', id);
      if (error) {
        console.error('[books/[id] DELETE]', error.message);
        return jsonError('Could not delete the book.', 500);
      }
    }

    deleteMemoryBook(id);
    deletePdf(id);

    return NextResponse.json({ success: true, message: 'Book and associated data deleted.' });
  } catch (error) {
    return routeError('books/[id] DELETE', error, 'Failed to delete book');
  }
}
