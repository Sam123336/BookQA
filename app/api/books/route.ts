import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getMemoryBooks } from '@/lib/rag/store';
import { routeError } from '@/lib/http';
import { Book } from '@/lib/types';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let books: Book[] = [];

    if (isSupabaseConfigured()) {
      const { data, error } = await supabaseAdmin
        .from('books')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[books] list query failed:', error.message);
      } else if (data) {
        books = data;
      }
    }

    // Merge memory books if Supabase didn't return any or for local dev fallback
    const memBooks = getMemoryBooks();
    for (const mb of memBooks) {
      if (!books.some(b => b.id === mb.id)) {
        books.push(mb);
      }
    }

    return NextResponse.json({ books });
  } catch (error) {
    return routeError('books', error, 'Failed to fetch books');
  }
}
