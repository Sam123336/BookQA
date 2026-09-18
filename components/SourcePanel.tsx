'use client';

import React, { useState, useEffect } from 'react';
import { Citation, Book } from '@/lib/types';
import { X, BookOpen } from 'lucide-react';
import { PdfViewer } from './PdfViewer';

interface SourcePanelProps {
  citation: Citation | null;
  book: Book | null;
  onClose: () => void;
}

const TABS = [
  { id: 'excerpt', label: 'Excerpt' },
  { id: 'pdf', label: 'Page view' },
] as const;

export const SourcePanel: React.FC<SourcePanelProps> = ({ citation, book, onClose }) => {
  const [activeTab, setActiveTab] = useState<'excerpt' | 'pdf'>('excerpt');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!citation || !book) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-edge bg-surface-1 shadow-pop sm:w-[30rem]"
      >
        <header className="flex items-center justify-between border-b border-edge px-5 py-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-accent-400" aria-hidden="true" />
            <h2 id="source-title" className="text-label font-semibold uppercase text-ink-soft">
              Source citation
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close source panel"
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="border-b border-edge px-5 py-4">
          <p className="text-label font-semibold uppercase text-ink-muted">Document</p>
          <p className="mt-1 truncate text-ui font-medium text-ink">{book.title}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="tabular rounded-lg border border-accent-600/40 bg-accent-600/15 px-2.5 py-1 text-meta font-semibold text-accent-400">
              Page {citation.page_number}
            </span>
            {citation.chapter && (
              <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-meta text-ink-soft">
                {citation.chapter}
              </span>
            )}
            {!!citation.similarity_score && (
              <span className="tabular ml-auto text-meta text-ink-muted">
                {(citation.similarity_score * 100).toFixed(1)}% match
              </span>
            )}
          </div>
        </div>

        <div role="tablist" aria-label="Source views" className="flex gap-1 border-b border-edge px-3">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`relative cursor-pointer px-3 py-3 text-ui font-medium transition-colors duration-200 ${
                  isActive ? 'text-ink' : 'text-ink-muted hover:text-ink-soft'
                }`}
              >
                {tab.label}
                {isActive && (
                  <span
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-t-full bg-accent-500"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'excerpt' ? (
            <div className="space-y-4">
              {citation.reason && (
                <p className="rounded-xl border border-edge bg-surface-2 px-3 py-3 text-meta italic text-ink-soft">
                  {citation.reason}
                </p>
              )}
              <div>
                <p className="mb-2 text-label font-semibold uppercase text-ink-muted">
                  Exact excerpt
                </p>
                <blockquote className="whitespace-pre-wrap rounded-xl border-l-2 border-accent-500 bg-surface-base px-4 py-4 text-body text-ink-soft">
                  {citation.excerpt}
                </blockquote>
              </div>
            </div>
          ) : (
            <PdfViewer bookId={book.id} pageNumber={citation.page_number} />
          )}
        </div>

        <footer className="border-t border-edge px-5 py-3 text-center text-meta text-ink-muted">
          Citation verified against the indexed book text.
        </footer>
      </aside>
    </>
  );
};
