'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Book, Message, Citation } from '@/lib/types';
import { ChatMessage } from './ChatMessage';
import { Send, BookOpen, AlertCircle, Sparkles } from 'lucide-react';

interface ChatWindowProps {
  book: Book | null;
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (question: string) => void;
  onSelectCitation: (citation: Citation) => void;
}

const EXAMPLE_PROMPTS = [
  'Summarize this book',
  'What are the major themes?',
  'Who are the main characters?',
  'What happens in the first chapter?',
];

function ThinkingRow() {
  return (
    <div className="px-4 py-6 sm:px-6" aria-live="polite">
      <div className="mx-auto flex max-w-3xl gap-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 text-white">
          <Sparkles className="h-4 w-4 animate-pulse" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-2.5 pt-1.5">
          {['w-11/12', 'w-4/5', 'w-2/3'].map((w) => (
            <div key={w} className={`relative h-3 overflow-hidden rounded-full bg-surface-2 ${w}`}>
              <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-surface-raised to-transparent" />
            </div>
          ))}
          <p className="pt-1 text-meta text-ink-muted">Searching the book and checking citations…</p>
        </div>
      </div>
    </div>
  );
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  book,
  messages,
  isLoading,
  onSendMessage,
  onSelectCitation,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isBookReady = book?.status === 'COMPLETED';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !isBookReady || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  if (!book) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-surface-base px-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-edge bg-surface-1">
          <BookOpen className="h-6 w-6 text-ink-muted" aria-hidden="true" />
        </span>
        <h2 className="text-ui font-semibold text-ink">No book selected</h2>
        <p className="max-w-sm text-meta text-ink-muted">
          Choose a book from the library or upload a PDF to start asking questions.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-base">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
            <div className="text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-glow">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-xl font-semibold tracking-tight text-ink">
                Ask anything about this book
              </h2>
              <p className="mx-auto mt-2 max-w-md text-ui text-ink-soft">
                Every answer is grounded in{' '}
                <span className="font-medium text-ink">{book.title}</span> and cites the pages it
                came from.
              </p>
            </div>

            <ul className="mt-8 grid gap-2 sm:grid-cols-2">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <li key={prompt}>
                  <button
                    onClick={() => isBookReady && !isLoading && onSendMessage(prompt)}
                    disabled={!isBookReady || isLoading}
                    className="w-full cursor-pointer rounded-xl border border-edge bg-surface-1 px-4 py-3.5 text-left text-ui text-ink-soft transition-all duration-200 hover:border-accent-600 hover:bg-surface-2 hover:text-ink active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="divide-y divide-edge">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} onSelectCitation={onSelectCitation} />
            ))}
            {isLoading && <ThinkingRow />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-edge bg-surface-1/90 px-4 py-4 backdrop-blur-xl sm:px-6">
        <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
          {!isBookReady && (
            <p
              role="status"
              className="mb-2.5 flex items-start gap-2 rounded-xl border border-warn/25 bg-warn/10 px-3 py-2.5 text-meta text-warn"
            >
              <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <strong className="font-medium">{book.title}</strong> is still processing. Questions
                unlock once it is ready.
              </span>
            </p>
          )}

          <div className="flex items-end gap-2 rounded-2xl border border-edge bg-surface-2 p-2 transition-colors duration-200 focus-within:border-accent-600">
            <label htmlFor="question" className="sr-only">
              Ask a question about {book.title}
            </label>
            <input
              id="question"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!isBookReady || isLoading}
              placeholder={isBookReady ? `Ask about ${book.title}…` : 'Processing document…'}
              className="min-h-[2.75rem] flex-1 bg-transparent px-3 text-body text-ink outline-none placeholder:text-ink-muted disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || !isBookReady || isLoading}
              aria-label="Send question"
              className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl bg-accent-600 text-white transition-all duration-200 hover:bg-accent-500 active:scale-95 disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-ink-muted"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
