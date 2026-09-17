import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params;

  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ messages: [] });
    }

    const { data: messages, error } = await supabaseAdmin
      .from('messages')
      .select(`
        id,
        session_id,
        role,
        content,
        grounded,
        created_at,
        citations (
          id,
          chunk_id,
          page_number,
          chapter,
          excerpt,
          similarity_score
        )
      `)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ messages: messages || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch messages' }, { status: 500 });
  }
}
