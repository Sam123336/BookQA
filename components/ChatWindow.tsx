'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Book, Message, Citation } from '@/lib/types';
import { ChatMessage } from './ChatMessage';
import { Send, Loader2, BookOpen, AlertCircle, HelpCircle } from 'lucide-react';

interface ChatWindowProps {
  book: Book | null;
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (question: string) => void;
  onSelectCitation: (citation: Citation) => void;
}

const EXAMPLE_PROMPTS = [
  "What is this book about?",
  "Who is the main character?",
  "What happens in the beginning?",
  "What are the major themes?"
];

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
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 bg-navy-950">
        <BookOpen className="w-12 h-12 text-navy-700 mb-3" />
        <h3 className="text-base font-medium text-slate-300">No book selected</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Select an uploaded book from the sidebar or upload a new PDF to begin asking grounded questions.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] bg-navy-950">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="max-w-xl mx-auto my-auto py-16 px-4 text-center">
            <h3 className="text-base font-semibold text-slate-200 mb-1">
              Ask a question about this book
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Answers are strictly grounded in <span className="font-medium text-slate-200">{book.title}</span> with verified page citations.
            </p>

            <div className="space-y-2 text-left">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-1">
                Suggested questions:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EXAMPLE_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if (isBookReady && !isLoading) {
                        onSendMessage(prompt);
                      }
                    }}
                    disabled={!isBookReady || isLoading}
                    className="p-3 text-xs bg-navy-900 hover:bg-navy-850 border border-navy-800 hover:border-navy-700 text-slate-300 hover:text-white rounded-md text-left transition-colors font-medium disabled:opacity-50 cursor-pointer"
                  >
                    • {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-navy-800/40">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onSelectCitation={onSelectCitation}
              />
            ))}
            {isLoading && (
              <div className="py-4 px-4 bg-transparent">
                <div className="max-w-3xl mx-auto flex items-center gap-3 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 text-brand-500 animate-spin" />
                  <span>Searching book vectors & generating grounded answer...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Form Bar */}
      <div className="p-4 border-t border-navy-800 bg-navy-900">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          {!isBookReady && (
            <div className="mb-2 flex items-center gap-2 text-xs text-amber-400 bg-amber-950/30 border border-amber-900/40 p-2 rounded-md">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                Question input is disabled while <strong>{book.title}</strong> is being processed. It will activate when status is Ready.
              </span>
            </div>
          )}

          <div className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!isBookReady || isLoading}
              placeholder={
                isBookReady
                  ? `Ask a question about ${book.title}...`
                  : 'Processing document...'
              }
              className="w-full bg-navy-950 border border-navy-700 focus:border-brand-500 text-slate-200 text-xs sm:text-sm rounded-md py-3 pl-4 pr-12 focus:outline-none placeholder:text-slate-500 disabled:opacity-50 transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim() || !isBookReady || isLoading}
              className="absolute right-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white p-1.5 rounded-md transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
