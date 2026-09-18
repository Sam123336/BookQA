'use client';

import React from 'react';
import { Book, ChatProvider } from '@/lib/types';
import { BookOpen, Plus, Trash2, ChevronDown, Sparkles } from 'lucide-react';

interface HeaderProps {
  books: Book[];
  selectedBook: Book | null;
  onSelectBook: (book: Book) => void;
  onOpenUpload: () => void;
  onDeleteBook: (bookId: string) => void;
  providers: ChatProvider[];
  provider: string;
  onSelectProvider: (name: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  books,
  selectedBook,
  onSelectBook,
  onOpenUpload,
  onDeleteBook,
  providers,
  provider,
  onSelectProvider,
}) => {
  return (
    <header className="z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-edge bg-surface-1/90 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex shrink-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-glow">
          <BookOpen className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="hidden min-w-0 xs:block sm:block">
          <p className="truncate text-ui font-semibold tracking-tight text-ink">BookQA</p>
          <p className="hidden truncate text-meta text-ink-muted sm:block">
            Grounded answers with page citations
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {providers.length > 1 && (
          <div className="relative hidden shrink-0 md:block">
            <label htmlFor="model-switcher" className="sr-only">
              Answer model
            </label>
            <Sparkles
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <select
              id="model-switcher"
              value={provider}
              onChange={(e) => onSelectProvider(e.target.value)}
              title="Model used to write answers. Retrieval always uses the book's own embeddings."
              className="h-11 w-52 cursor-pointer appearance-none truncate rounded-xl border border-edge bg-surface-2 pl-9 pr-9 text-ui text-ink-soft transition-colors duration-200 hover:border-edge-strong hover:text-ink"
            >
              {providers.map((p) => (
                <option key={p.name} value={p.name} className="bg-surface-2 text-ink">
                  {p.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
          </div>
        )}

        {books.length > 0 && (
          <div className="relative min-w-0 flex-1 sm:flex-none sm:w-72">
            <label htmlFor="book-switcher" className="sr-only">
              Select a book
            </label>
            <select
              id="book-switcher"
              value={selectedBook?.id || ''}
              onChange={(e) => {
                const b = books.find((item) => item.id === e.target.value);
                if (b) onSelectBook(b);
              }}
              className="h-11 w-full min-w-0 max-w-[18rem] cursor-pointer appearance-none truncate rounded-xl border border-edge bg-surface-2 pl-3 pr-9 text-ui text-ink-soft transition-colors duration-200 hover:border-edge-strong hover:text-ink"
            >
              {books.map((book) => (
                <option key={book.id} value={book.id} className="bg-surface-2 text-ink">
                  {book.title} {book.page_count > 0 ? `· ${book.page_count}p` : ''}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
          </div>
        )}

        <button
          onClick={onOpenUpload}
          className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-accent-600 px-3.5 text-ui font-medium text-white shadow-raise transition-all duration-200 hover:bg-accent-500 active:scale-[0.98] sm:px-4"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Add book</span>
          <span className="sr-only sm:hidden">Add book</span>
        </button>

        {selectedBook && (
          <button
            onClick={() => {
              if (confirm(`Delete "${selectedBook.title}"? This cannot be undone.`)) {
                onDeleteBook(selectedBook.id);
              }
            }}
            aria-label={`Delete ${selectedBook.title}`}
            className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl text-ink-muted transition-colors duration-200 hover:bg-surface-2 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  );
};
