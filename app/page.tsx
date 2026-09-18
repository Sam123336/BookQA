'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Book, Message, Citation } from '@/lib/types';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { IngestionProgress } from '@/components/IngestionProgress';
import { ChatWindow } from '@/components/ChatWindow';
import { UploadModal } from '@/components/UploadModal';
import { SourcePanel } from '@/components/SourcePanel';

const AUTO_SUMMARY_PROMPT = 'Summarize this book';

export default function HomePage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingAnswer, setIsLoadingAnswer] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const autoSummarized = useRef<Set<string>>(new Set());

  // 1. Fetch Books List
  const fetchBooks = useCallback(async () => {
    try {
      const res = await fetch('/api/books');
      if (res.ok) {
        const data = await res.json();
        setBooks(data.books || []);
        
        // Auto-select first book if none selected
        if (!selectedBook && data.books && data.books.length > 0) {
          setSelectedBook(data.books[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch books:", err);
    }
  }, [selectedBook]);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  // 2. Poll Status for Ingesting Books
  useEffect(() => {
    if (!selectedBook || selectedBook.status === 'COMPLETED' || selectedBook.status === 'FAILED') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/books/${selectedBook.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.book) {
            setSelectedBook(data.book);
            setBooks(prev => prev.map(b => b.id === data.book.id ? data.book : b));
          }
        }
      } catch (err) {
        console.error("Status polling error:", err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [selectedBook]);

  useEffect(() => {
    const book = selectedBook;
    setMessages([]);
    setSessionId(null);
    setActiveCitation(null);
    if (!book || book.status !== 'COMPLETED') return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/books/${book.id}/session`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;

        if (data.messages?.length) {
          setSessionId(data.sessionId);
          setMessages(data.messages);
          return;
        }

        if (autoSummarized.current.has(book.id)) return;
        autoSummarized.current.add(book.id);
        handleSendMessage(AUTO_SUMMARY_PROMPT, null);
      } catch {
      }
    })();

    return () => { cancelled = true; };
  }, [selectedBook?.id, selectedBook?.status]);

  // 4. Handle Question Submission
  const handleSendMessage = async (question: string, forceSessionId?: string | null) => {
    if (!selectedBook) return;
    const activeSessionId = forceSessionId !== undefined ? forceSessionId : sessionId;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      session_id: activeSessionId || '',
      role: 'user',
      content: question,
      grounded: true,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoadingAnswer(true);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: selectedBook.id,
          sessionId: activeSessionId,
          question,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate answer.');
      }

      if (data.sessionId) setSessionId(data.sessionId);

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        session_id: data.sessionId || '',
        role: 'assistant',
        content: data.answer,
        grounded: data.grounded,
        citations: data.citations || [],
        created_at: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        session_id: '',
        role: 'assistant',
        content: `Error: ${err.message || 'An unexpected error occurred while querying the book.'}`,
        grounded: false,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoadingAnswer(false);
    }
  };

  // 5. Handle Book Deletion
  const handleDeleteBook = async (bookId: string) => {
    try {
      await fetch(`/api/books/${bookId}`, { method: 'DELETE' });
      setBooks(prev => prev.filter(b => b.id !== bookId));
      if (selectedBook?.id === bookId) {
        const remaining = books.filter(b => b.id !== bookId);
        setSelectedBook(remaining.length > 0 ? remaining[0] : null);
      }
    } catch (err) {
      console.error("Delete book error:", err);
    }
  };

  // 6. Handle Upload Success
  const handleUploadSuccess = (newBook: Book) => {
    setBooks(prev => [newBook, ...prev]);
    setSelectedBook(newBook);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface-base">
      <Header
        books={books}
        selectedBook={selectedBook}
        onSelectBook={setSelectedBook}
        onOpenUpload={() => setIsUploadOpen(true)}
        onDeleteBook={handleDeleteBook}
      />

      {selectedBook && <IngestionProgress book={selectedBook} />}

      <div className="flex min-h-0 flex-1">
        <Sidebar
          books={books}
          selectedBook={selectedBook}
          onSelectBook={setSelectedBook}
          onOpenUpload={() => setIsUploadOpen(true)}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ChatWindow
            book={selectedBook}
            messages={messages}
            isLoading={isLoadingAnswer}
            onSendMessage={handleSendMessage}
            onSelectCitation={setActiveCitation}
          />
        </main>
      </div>

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={handleUploadSuccess}
      />

      <SourcePanel
        citation={activeCitation}
        book={selectedBook}
        onClose={() => setActiveCitation(null)}
      />
    </div>
  );
}
