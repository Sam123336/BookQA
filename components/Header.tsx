'use client';

import React from 'react';
import { Book } from '@/lib/types';
import { BookOpen, Plus, Trash2, ChevronDown } from 'lucide-react';

interface HeaderProps {
  books: Book[];
  selectedBook: Book | null;
  onSelectBook: (book: Book) => void;
  onOpenUpload: () => void;
  onDeleteBook: (bookId: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  books,
  selectedBook,
  onSelectBook,
  onOpenUpload,
  onDeleteBook,
}) => {
  return (
    <header className="h-14 border-b border-navy-800 bg-navy-900 px-4 flex items-center justify-between text-slate-200">
      <div className="flex items-center gap-3">
        <div className="bg-brand-600 text-white p-1.5 rounded-md flex items-center justify-center">
          <BookOpen className="w-5 h-5" />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white tracking-tight">BookQA</span>
          <span className="text-slate-500 text-sm hidden sm:inline">|</span>
          <span className="text-slate-400 text-sm hidden sm:inline">Ask questions about your documents</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {books.length > 0 && (
          <div className="relative group">
            <select
              value={selectedBook?.id || ''}
              onChange={(e) => {
                const b = books.find(item => item.id === e.target.value);
                if (b) onSelectBook(b);
              }}
              className="appearance-none bg-navy-850 hover:bg-navy-800 text-slate-200 border border-navy-700 text-xs sm:text-sm rounded-md py-1.5 pl-3 pr-8 focus:outline-none focus:border-brand-500 cursor-pointer transition-colors"
            >
              {books.map((book) => (
                <option key={book.id} value={book.id} className="bg-navy-900 text-slate-200">
                  {book.title} ({book.page_count > 0 ? `${book.page_count}p` : 'Ingesting'})
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        )}

        <button
          onClick={onOpenUpload}
          className="bg-brand-600 hover:bg-brand-500 text-white text-xs sm:text-sm px-3 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add book</span>
        </button>

        {selectedBook && (
          <button
            onClick={() => {
              if (confirm(`Are you sure you want to delete "${selectedBook.title}"?`)) {
                onDeleteBook(selectedBook.id);
              }
            }}
            title="Delete selected book"
            className="text-slate-400 hover:text-red-400 p-1.5 rounded-md hover:bg-navy-800 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};
