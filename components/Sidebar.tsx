'use client';

import React from 'react';
import { Book } from '@/lib/types';
import { Plus, BookOpen, FileText, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

interface SidebarProps {
  books: Book[];
  selectedBook: Book | null;
  onSelectBook: (book: Book) => void;
  onOpenUpload: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  books,
  selectedBook,
  onSelectBook,
  onOpenUpload,
}) => {
  return (
    <aside className="w-64 border-r border-navy-800 bg-navy-950 flex flex-col h-[calc(100vh-3.5rem)] text-slate-300">
      <div className="p-3 border-b border-navy-800">
        <button
          onClick={onOpenUpload}
          className="w-full bg-navy-850 hover:bg-navy-800 border border-navy-700 hover:border-slate-600 text-slate-200 text-xs sm:text-sm py-2 px-3 rounded-md flex items-center justify-center gap-2 font-medium transition-colors"
        >
          <Plus className="w-4 h-4 text-brand-500" />
          <span>Add book</span>
        </button>
      </div>

      <div className="p-3">
        <h2 className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase px-2 mb-2">
          Books ({books.length})
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {books.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-slate-500">
            No books uploaded yet.
          </div>
        ) : (
          books.map((book) => {
            const isSelected = selectedBook?.id === book.id;
            const isReady = book.status === 'COMPLETED';
            const isFailed = book.status === 'FAILED';
            const isProcessing = !isReady && !isFailed;

            return (
              <button
                key={book.id}
                onClick={() => onSelectBook(book)}
                className={`w-full text-left p-2.5 rounded-md text-xs transition-colors flex items-start gap-2.5 ${
                  isSelected
                    ? 'bg-navy-850 border border-navy-700 text-white font-medium'
                    : 'hover:bg-navy-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-brand-500' : 'text-slate-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-xs font-medium text-slate-200">{book.title}</div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                    <span>{book.page_count > 0 ? `${book.page_count} pages` : 'PDF'}</span>
                    <span>•</span>
                    {isReady && (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span> Ready
                      </span>
                    )}
                    {isProcessing && (
                      <span className="text-amber-400 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Ingesting
                      </span>
                    )}
                    {isFailed && (
                      <span className="text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Failed
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
};
