'use client';

import React from 'react';
import { Book } from '@/lib/types';
import { Plus, FileText, Loader2, AlertCircle, Library } from 'lucide-react';

interface SidebarProps {
  books: Book[];
  selectedBook: Book | null;
  onSelectBook: (book: Book) => void;
  onOpenUpload: () => void;
}

function StatusBadge({ book }: { book: Book }) {
  if (book.status === 'COMPLETED') {
    return (
      <span className="inline-flex items-center gap-1.5 text-ok">
        <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />
        Ready
      </span>
    );
  }
  if (book.status === 'FAILED') {
    return (
      <span className="inline-flex items-center gap-1.5 text-danger">
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-warn">
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      Ingesting
    </span>
  );
}

export const Sidebar: React.FC<SidebarProps> = ({
  books,
  selectedBook,
  onSelectBook,
  onOpenUpload,
}) => {
  return (
    <aside className="hidden min-h-0 w-72 shrink-0 flex-col border-r border-edge bg-surface-1 md:flex">
      <div className="p-3">
        <button
          onClick={onOpenUpload}
          className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-edge bg-surface-2 text-ui font-medium text-ink-soft transition-all duration-200 hover:border-accent-600 hover:bg-surface-3 hover:text-ink active:scale-[0.99]"
        >
          <Plus className="h-4 w-4 text-accent-400" aria-hidden="true" />
          Add book
        </button>
      </div>

      <div className="flex items-center justify-between px-5 pb-2 pt-1">
        <h2 className="text-label font-semibold uppercase text-ink-muted">Library</h2>
        <span className="tabular rounded-full bg-surface-2 px-2 py-0.5 text-label text-ink-muted">
          {books.length}
        </span>
      </div>

      <nav aria-label="Books" className="flex-1 overflow-y-auto px-2 pb-4">
        {books.length === 0 ? (
          <div className="mx-2 mt-6 rounded-2xl border border-dashed border-edge px-4 py-10 text-center">
            <Library className="mx-auto h-7 w-7 text-ink-muted" aria-hidden="true" />
            <p className="mt-3 text-ui font-medium text-ink-soft">No books yet</p>
            <p className="mt-1 text-meta text-ink-muted">
              Upload a PDF to start asking grounded questions.
            </p>
            <button
              onClick={onOpenUpload}
              className="mt-4 cursor-pointer text-meta font-medium text-accent-400 transition-colors hover:text-accent-500"
            >
              Upload your first book
            </button>
          </div>
        ) : (
          <ul className="space-y-1">
            {books.map((book) => {
              const isSelected = selectedBook?.id === book.id;
              return (
                <li key={book.id}>
                  <button
                    onClick={() => onSelectBook(book)}
                    aria-current={isSelected ? 'true' : undefined}
                    className={`group relative flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-200 ${
                      isSelected
                        ? 'bg-surface-3 text-ink'
                        : 'text-ink-soft hover:bg-surface-2 hover:text-ink'
                    }`}
                  >
                    {isSelected && (
                      <span
                        className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-500"
                        aria-hidden="true"
                      />
                    )}
                    <FileText
                      className={`mt-0.5 h-4 w-4 shrink-0 transition-colors ${
                        isSelected ? 'text-accent-400' : 'text-ink-muted group-hover:text-ink-soft'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ui font-medium">{book.title}</span>
                      <span className="mt-1 flex items-center gap-2 text-meta text-ink-muted">
                        <span className="tabular">
                          {book.page_count > 0 ? `${book.page_count} pages` : 'PDF'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <StatusBadge book={book} />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
};
