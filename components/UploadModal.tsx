'use client';

import React, { useState, useRef } from 'react';
import { Book } from '@/lib/types';
import { Upload, X, FileText, AlertCircle, Loader2 } from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (book: Book) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (selectedFile: File) => {
    setError(null);
    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF documents are supported.');
      return;
    }
    if (selectedFile.size === 0) {
      setError('Selected PDF file is empty.');
      return;
    }
    setFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/books/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload document.');
      }

      onUploadSuccess(data.book);
      onClose();
      setFile(null);
    } catch (err: any) {
      setError(err.message || 'Upload error');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-navy-900 border border-navy-700 rounded-lg w-full max-w-md overflow-hidden shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-navy-800">
          <h3 className="text-sm font-semibold text-white">Upload Book Document</h3>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-md hover:bg-navy-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-brand-500 bg-brand-500/10'
                : 'border-navy-700 hover:border-slate-500 bg-navy-950'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
            />

            <Upload className="w-8 h-8 text-brand-500 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-200">
              Click to select or drag & drop a PDF document
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Supports 300+ page books (.pdf)
            </p>
          </div>

          {file && (
            <div className="flex items-center gap-2 p-3 bg-navy-850 rounded-md border border-navy-750 text-xs text-slate-200">
              <FileText className="w-4 h-4 text-brand-500 shrink-0" />
              <div className="truncate flex-1 font-medium">{file.name}</div>
              <div className="text-slate-500 shrink-0 text-[11px]">
                {(file.size / (1024 * 1024)).toFixed(1)} MB
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/40 p-3 rounded-md border border-red-900/50">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-navy-800 bg-navy-950">
          <button
            onClick={onClose}
            disabled={isUploading}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs px-4 py-1.5 rounded-md font-medium flex items-center gap-2 transition-colors"
          >
            {isUploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{isUploading ? 'Uploading...' : 'Start Ingestion'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
