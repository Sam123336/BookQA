'use client';

import React from 'react';
import { Message, Citation } from '@/lib/types';
import { User, Sparkles, Quote } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
  onSelectCitation: (citation: Citation) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onSelectCitation }) => {
  const isUser = message.role === 'user';
  const citations = message.citations ?? [];

  return (
    <article className="animate-fade-up px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-3xl gap-4">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
            isUser ? 'bg-surface-3 text-ink-soft' : 'bg-gradient-to-br from-accent-500 to-accent-700 text-white'
          }`}
          aria-hidden="true"
        >
          {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="mb-1.5 text-label font-semibold uppercase text-ink-muted">
            {isUser ? 'You' : 'BookQA'}
          </h3>

          <div
            className={`whitespace-pre-wrap text-body ${
              isUser ? 'text-ink-soft' : 'text-ink'
            }`}
          >
            {message.content}
          </div>

          {!isUser && citations.length > 0 && (
            <section className="mt-5 rounded-2xl border border-edge bg-surface-1 p-4">
              <h4 className="mb-3 flex items-center gap-2 text-label font-semibold uppercase text-ink-muted">
                <Quote className="h-3.5 w-3.5 text-accent-400" aria-hidden="true" />
                Verified sources
              </h4>

              <ul className="flex flex-wrap gap-2">
                {citations.map((cit, idx) => {
                  const detail = cit.chapter || cit.reason;
                  return (
                    <li key={cit.id || `cit-${idx}`}>
                      <button
                        onClick={() => onSelectCitation(cit)}
                        aria-label={`Open page ${cit.page_number} in the source document`}
                        className="group inline-flex max-w-full cursor-pointer items-center gap-2 rounded-xl border border-edge bg-surface-2 py-2 pl-2 pr-3 text-left transition-all duration-200 hover:border-accent-600 hover:bg-surface-3 active:scale-[0.98]"
                      >
                        <span className="tabular rounded-lg bg-accent-600/15 px-2 py-1 text-meta font-semibold text-accent-400">
                          p.{cit.page_number}
                        </span>
                        {detail && (
                          <span className="truncate text-meta text-ink-soft transition-colors group-hover:text-ink">
                            {detail}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </article>
  );
};
