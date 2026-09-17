'use client';

import React from 'react';
import { Book } from '@/lib/types';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface IngestionProgressProps {
  book: Book;
}

export const IngestionProgress: React.FC<IngestionProgressProps> = ({ book }) => {
  const isReady = book.status === 'COMPLETED';
  const isFailed = book.status === 'FAILED';
  
  if (isReady) return null;

  const getStepLabel = (status: string) => {
    switch (status) {
      case 'PENDING': return 'Uploading & Initializing...';
      case 'EXTRACTING': return 'Extracting text page-by-page...';
      case 'EMBEDDING': return 'Generating OpenAI embeddings (batched)...';
      case 'INDEXING': return 'Indexing vectors in Supabase pgvector...';
      case 'FAILED': return 'Ingestion failed';
      default: return 'Processing...';
    }
  };

  const progressPercent = book.total_chunks > 0 
    ? Math.min(100, Math.round((book.processed_chunks / book.total_chunks) * 100))
    : (book.status === 'EXTRACTING' ? 15 : 5);

  return (
    <div className="bg-navy-900 border-b border-navy-800 p-3 px-4">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {isFailed ? (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          ) : (
            <Loader2 className="w-5 h-5 text-brand-500 animate-spin shrink-0" />
          )}

          <div>
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
              <span>{book.title}</span>
              <span className="text-[11px] font-normal text-slate-400">({book.page_count} pages)</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {isFailed ? (book.error_message || 'An error occurred during ingestion.') : getStepLabel(book.status)}
            </div>
          </div>
        </div>

        {!isFailed && (
          <div className="w-full sm:w-64 flex flex-col gap-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>
                {book.total_chunks > 0
                  ? `Chunks ${book.processed_chunks} / ${book.total_chunks}`
                  : 'Preparing...'}
              </span>
              <span>{progressPercent}%</span>
            </div>

            <div className="w-full bg-navy-950 h-1.5 rounded-full overflow-hidden border border-navy-800">
              <div
                className="bg-brand-500 h-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
