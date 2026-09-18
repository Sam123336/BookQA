import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { routeError } from '@/lib/http';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ sessionId: null, messages: [] });
    }

    const { data: session, error: sErr } = await supabaseAdmin
      .from('chat_sessions')
      .select('id')
      .eq('book_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sErr) throw new Error(sErr.message);
    if (!session) return NextResponse.json({ sessionId: null, messages: [] });

    const { data: messages, error: mErr } = await supabaseAdmin
      .from('messages')
      .select(`id, session_id, role, content, grounded, created_at,
               citations ( id, chunk_id, page_number, chapter, excerpt, similarity_score )`)
      .eq('session_id', session.id)
      .order('created_at', { ascending: true });

    if (mErr) throw new Error(mErr.message);

    return NextResponse.json({ sessionId: session.id, messages: messages || [] });
  } catch (error) {
    return routeError('books/[id]/session', error, 'Failed to fetch session');
  }
}
