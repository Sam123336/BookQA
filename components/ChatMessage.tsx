'use client';

import React from 'react';
import { Message, Citation } from '@/lib/types';
import { User, Bot, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
  onSelectCitation: (citation: Citation) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onSelectCitation,
}) => {
  const isUser = message.role === 'user';
  const hasCitations = message.citations && message.citations.length > 0;

  return (
    <div className={`py-4 px-4 ${isUser ? 'bg-navy-900/50' : 'bg-transparent'} transition-colors`}>
      <div className="max-w-3xl mx-auto flex gap-3.5">
        <div
          className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold ${
            isUser
              ? 'bg-navy-700 text-slate-200'
              : 'bg-brand-600 text-white'
          }`}
        >
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </div>

        <div className="flex-1 min-w-0 space-y-2 text-xs sm:text-sm text-slate-200 leading-relaxed">
          <div className="font-semibold text-slate-400 text-[11px] uppercase tracking-wider mb-1">
            {isUser ? 'You' : 'BookQA Assistant'}
          </div>

          <div className="whitespace-pre-wrap text-slate-200">
            {message.content}
          </div>

          {!isUser && hasCitations && (
            <div className="pt-2 mt-3 border-t border-navy-800/80">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-brand-500" />
                <span>Verified Sources</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {message.citations!.map((cit, idx) => {
                  const label = cit.reason || (cit.chapter ? `${cit.chapter}` : `Page ${cit.page_number}`);
                  return (
                    <button
                      key={cit.id || `cit-${idx}`}
                      onClick={() => onSelectCitation(cit)}
                      className="group flex items-center gap-1.5 bg-navy-850 hover:bg-navy-800 border border-navy-700 hover:border-brand-500/50 text-slate-300 hover:text-white px-2.5 py-1 rounded text-xs transition-colors cursor-pointer"
                    >
                      <span className="font-mono font-medium text-brand-400">
                        Page {cit.page_number}
                      </span>
                      {label && label !== `Page ${cit.page_number}` && (
                        <>
                          <span className="text-slate-600">•</span>
                          <span className="truncate max-w-[160px] text-slate-400 group-hover:text-slate-200">
                            {label}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
