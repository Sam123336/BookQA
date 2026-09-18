'use client';

import React from 'react';
import { Book } from '@/lib/types';
import { Loader2, AlertCircle } from 'lucide-react';

interface IngestionProgressProps {
  book: Book;
}

const STEP_LABEL: Record<string, string> = {
  PENDING: 'Queued for processing',
  EXTRACTING: 'Reading the document',
  EMBEDDING: 'Understanding the text',
  INDEXING: 'Building the search index',
  FAILED: 'Ingestion failed',
};

// Chunks are produced page by page in order, so the share of chunks done is a
// faithful stand-in for the share of pages done - and pages are what a reader
// recognises. Exact page tracking would need another column on `books`.
function pagesDone(book: Book): number | null {
  if (book.page_count <= 0 || book.total_chunks <= 0) return null;
  const ratio = book.processed_chunks / book.total_chunks;
  return Math.min(book.page_count, Math.round(ratio * book.page_count));
}

export const IngestionProgress: React.FC<IngestionProgressProps> = ({ book }) => {
  if (book.status === 'COMPLETED') return null;

  const isFailed = book.status === 'FAILED';
  const pages = pagesDone(book);
  const percent =
    book.total_chunks > 0
      ? Math.min(100, Math.round((book.processed_chunks / book.total_chunks) * 100))
      : book.status === 'EXTRACTING'
        ? 15
        : 5;

  return (
    <section
      aria-live="polite"
      className={`shrink-0 border-b px-4 py-3 sm:px-6 ${
        isFailed ? 'border-danger/25 bg-danger/10' : 'border-edge bg-surface-1'
      }`}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {isFailed ? (
            <AlertCircle className="h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
          ) : (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-accent-400" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <p className="truncate text-ui font-medium text-ink">{book.title}</p>
            <p className={`mt-0.5 text-meta ${isFailed ? 'text-danger' : 'text-ink-muted'}`}>
              {isFailed
                ? book.error_message || 'Something went wrong during ingestion.'
                : STEP_LABEL[book.status] ?? 'Processing'}
            </p>
          </div>
        </div>

        {!isFailed && (
          <div className="w-full sm:w-64">
            <div className="mb-1.5 flex items-center justify-between text-meta text-ink-muted">
              <span className="tabular">
                {pages !== null
                  ? `${pages} / ${book.page_count} pages`
                  : book.page_count > 0
                    ? `${book.page_count} pages found`
                    : 'Preparing…'}
              </span>
              <span className="tabular font-medium text-ink-soft">{percent}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Ingesting ${book.title}`}
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-400 transition-[width] duration-300 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
