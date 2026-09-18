import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { queryBookQuestion } from '@/lib/rag/query';
import { getMemoryBook } from '@/lib/rag/store';
import { jsonError, routeError } from '@/lib/http';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bookId, sessionId: reqSessionId, question } = body;

    if (!bookId || !question || typeof question !== 'string' || !question.trim()) {
      return jsonError('bookId and valid non-empty question are required.', 400);
    }

    // Fetch book to verify status and title
    let bookTitle = 'Selected Book';
    let isReady = false;

    if (isSupabaseConfigured()) {
      const { data: bookData } = await supabaseAdmin
        .from('books')
        .select('title, status')
        .eq('id', bookId)
        .single();

      if (bookData) {
        bookTitle = bookData.title;
        isReady = bookData.status === 'COMPLETED';
      }
    } else {
      const memBook = getMemoryBook(bookId);
      if (memBook) {
        bookTitle = memBook.title;
        isReady = memBook.status === 'COMPLETED';
      }
    }

    if (!isReady) {
      return jsonError('Book is still being processed. Question answering is disabled until status is Ready.', 400);
    }

    // Ensure active chat session
    let sessionId = reqSessionId;
    if (!sessionId && isSupabaseConfigured()) {
      const { data: sessionData, error: sessionErr } = await supabaseAdmin
        .from('chat_sessions')
        .insert({ book_id: bookId })
        .select('id')
        .single();

      if (!sessionErr && sessionData) {
        sessionId = sessionData.id;
      }
    }

    if (!sessionId) {
      sessionId = crypto.randomUUID();
    }

    // Execute Vector RAG Search & LLM Answer Generation
    const result = await queryBookQuestion(bookId, bookTitle, question.trim());

    // Save messages to database if Supabase is active
    if (isSupabaseConfigured() && sessionId) {
      // 1. Save User Message
      await supabaseAdmin.from('messages').insert({
        session_id: sessionId,
        role: 'user',
        content: question.trim(),
        grounded: true,
      });

      // 2. Save Assistant Message
      const { data: assistantMsg } = await supabaseAdmin
        .from('messages')
        .insert({
          session_id: sessionId,
          role: 'assistant',
          content: result.answer,
          grounded: result.grounded,
        })
        .select('id')
        .single();

      // 3. Save Verified Citations
      if (assistantMsg && result.citations.length > 0) {
        const citationRows = result.citations.map(c => ({
          message_id: assistantMsg.id,
          chunk_id: c.chunk_id || null,
          page_number: c.page_number,
          chapter: c.chapter || '',
          excerpt: c.excerpt,
          similarity_score: c.similarity_score || 0,
        }));

        await supabaseAdmin.from('citations').insert(citationRows);
      }
    }

    return NextResponse.json({
      answer: result.answer,
      citations: result.citations,
      grounded: result.grounded,
      sessionId,
      retrievedChunksCount: result.retrievedChunksCount,
    });

  } catch (error) {
    return routeError('ask', error, 'An unexpected error occurred.');
  }
}
