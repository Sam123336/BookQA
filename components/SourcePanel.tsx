'use client';

import React, { useState } from 'react';
import { Citation, Book } from '@/lib/types';
import { X, FileText, BookOpen, ExternalLink, Sparkles } from 'lucide-react';
import { PdfViewer } from './PdfViewer';

interface SourcePanelProps {
  citation: Citation | null;
  book: Book | null;
  onClose: () => void;
}

export const SourcePanel: React.FC<SourcePanelProps> = ({
  citation,
  book,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'excerpt' | 'pdf'>('excerpt');

  if (!citation || !book) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-navy-900 border-l border-navy-800 shadow-2xl flex flex-col transition-all duration-200 ease-in-out text-slate-200">
      <div className="flex items-center justify-between p-4 border-b border-navy-800 bg-navy-950">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-brand-500" />
          <span className="text-xs font-semibold text-white tracking-wide uppercase">Source Citation</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-navy-850 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Book Metadata Header */}
      <div className="p-4 border-b border-navy-800 bg-navy-900">
        <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Document</div>
        <h4 className="text-sm font-semibold text-white mt-0.5 truncate">{book.title}</h4>
        
        <div className="flex items-center gap-3 mt-2 text-xs text-slate-300">
          <span className="bg-brand-600/20 text-brand-400 border border-brand-500/30 px-2 py-0.5 rounded font-mono font-medium">
            Page {citation.page_number}
          </span>
          {citation.chapter && (
            <span className="text-slate-400 font-medium truncate">
              {citation.chapter}
            </span>
          )}
          {citation.similarity_score !== undefined && citation.similarity_score > 0 && (
            <span className="text-slate-500 text-[11px] ml-auto font-mono">
              Similarity: {(citation.similarity_score * 100).toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex items-center border-b border-navy-800 bg-navy-950 px-4">
        <button
          onClick={() => setActiveTab('excerpt')}
          className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'excerpt'
              ? 'border-brand-500 text-brand-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Relevant Excerpt
        </button>
        <button
          onClick={() => setActiveTab('pdf')}
          className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'pdf'
              ? 'border-brand-500 text-brand-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>PDF Page View</span>
        </button>
      </div>

      {/* Panel Content Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'excerpt' ? (
          <div className="space-y-3">
            {citation.reason && (
              <div className="text-xs text-slate-400 italic bg-navy-850 p-2.5 rounded border border-navy-750">
                "{citation.reason}"
              </div>
            )}

            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Exact Book Chunk Excerpt
            </div>
            
            <div className="bg-navy-950 p-4 rounded-md border border-navy-800 text-xs text-slate-300 leading-relaxed font-serif whitespace-pre-wrap selection:bg-brand-600/40">
              "{citation.excerpt}"
            </div>
          </div>
        ) : (
          <div className="h-full">
            <PdfViewer bookId={book.id} pageNumber={citation.page_number} />
          </div>
        )}
      </div>

      <div className="p-3 border-t border-navy-800 bg-navy-950 text-center text-[11px] text-slate-500">
        Verified page citation extracted directly from book context.
      </div>
    </div>
  );
};
