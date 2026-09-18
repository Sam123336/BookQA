'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Book } from '@/lib/types';
import { Upload, X, FileText, AlertCircle, Loader2 } from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (book: Book) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onUploadSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isUploading) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, isUploading, onClose]);

  if (!isOpen) return null;

  const handleFileSelect = (selectedFile: File) => {
    setError(null);
    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF documents are supported.');
      return;
    }
    if (selectedFile.size === 0) {
      setError('That PDF is empty. Pick a different file.');
      return;
    }
    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/books/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upload document.');
      onUploadSuccess(data.book);
      onClose();
      setFile(null);
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isUploading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
        className="w-full max-w-lg animate-fade-up overflow-hidden rounded-2xl border border-edge bg-surface-1 shadow-pop"
      >
        <header className="flex items-center justify-between border-b border-edge px-5 py-4">
          <h2 id="upload-title" className="text-ui font-semibold text-ink">
            Add a book
          </h2>
          <button
            ref={closeRef}
            onClick={onClose}
            disabled={isUploading}
            aria-label="Close dialog"
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <button
            type="button"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`w-full cursor-pointer rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-200 ${
              isDragging
                ? 'border-accent-500 bg-accent-600/15'
                : 'border-edge bg-surface-base hover:border-edge-strong'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            />
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-accent-600/15">
              <Upload className="h-5 w-5 text-accent-400" aria-hidden="true" />
            </span>
            <span className="mt-3 block text-ui font-medium text-ink">
              Drop a PDF here, or click to browse
            </span>
            <span className="mt-1 block text-meta text-ink-muted">
              Up to 50MB · works with 300+ page books
            </span>
          </button>

          {file && (
            <div className="flex items-center gap-3 rounded-xl border border-edge bg-surface-2 px-3 py-3">
              <FileText className="h-4 w-4 shrink-0 text-accent-400" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-ui text-ink">{file.name}</span>
              <span className="tabular shrink-0 text-meta text-ink-muted">
                {(file.size / (1024 * 1024)).toFixed(1)} MB
              </span>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/10 px-3 py-3 text-meta text-danger"
            >
              <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-edge bg-surface-base px-5 py-4">
          <button
            onClick={onClose}
            disabled={isUploading}
            className="h-11 cursor-pointer rounded-xl px-4 text-ui font-medium text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-accent-600 px-5 text-ui font-medium text-white transition-all duration-200 hover:bg-accent-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-ink-muted"
          >
            {isUploading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {isUploading ? 'Uploading…' : 'Start ingestion'}
          </button>
        </footer>
      </div>
    </div>
  );
};
