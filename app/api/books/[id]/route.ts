import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getMemoryBook, deleteMemoryBook } from '@/lib/rag-engine';

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

    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch book' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    if (isSupabaseConfigured()) {
      // Delete from Supabase tables (cascade handles chunks, sessions, messages)
      await supabaseAdmin.from('books').delete().eq('id', id);
    }

    deleteMemoryBook(id);

    return NextResponse.json({ success: true, message: 'Book and associated data deleted.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete book' }, { status: 500 });
  }
}
