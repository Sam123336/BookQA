'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

interface PdfViewerProps {
  bookId: string;
  pageNumber: number;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ bookId, pageNumber }) => {
  const [currentPage, setCurrentPage] = useState(pageNumber);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setCurrentPage(pageNumber);
  }, [pageNumber]);

  useEffect(() => {
    let active = true;

    async function renderPdfPage() {
      try {
        setLoading(true);
        setError(null);

        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

        const pdfUrl = `/api/books/${bookId}/pdf`;
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;

        if (!active) return;

        if (currentPage < 1 || currentPage > pdf.numPages) {
          setError(`Invalid page number ${currentPage} (Document has ${pdf.numPages} pages).`);
          setLoading(false);
          return;
        }

        const page = await pdf.getPage(currentPage);
        if (!active) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport,
        };

        await page.render(renderContext).promise;
        if (active) setLoading(false);
      } catch (err: any) {
        if (active) {
          console.warn("Canvas PDF render note:", err.message);
          setError("Direct PDF canvas rendering unavailable. Previewing text excerpt.");
          setLoading(false);
        }
      }
    }

    renderPdfPage();

    return () => {
      active = false;
    };
  }, [bookId, currentPage, scale]);

  return (
    <div className="flex flex-col h-full bg-navy-950 rounded-md border border-navy-800 overflow-hidden">
      <div className="flex items-center justify-between p-2 px-3 border-b border-navy-800 bg-navy-900 text-xs text-slate-300">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="p-1 rounded hover:bg-navy-800 text-slate-400 hover:text-white"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono text-[11px] px-1.5">Page {currentPage}</span>
          <button
            onClick={() => setCurrentPage(p => p + 1)}
            className="p-1 rounded hover:bg-navy-800 text-slate-400 hover:text-white"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale(s => Math.max(0.8, s - 0.2))}
            className="p-1 rounded hover:bg-navy-800 text-slate-400 hover:text-white"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono text-slate-400">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale(s => Math.min(2.0, s + 0.2))}
            className="p-1 rounded hover:bg-navy-800 text-slate-400 hover:text-white"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-navy-950 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-navy-950/80 z-10">
            <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
          </div>
        )}

        {error ? (
          <div className="text-center p-6 text-slate-400 text-xs max-w-xs">
            <p className="font-medium text-slate-300 mb-1">Page {currentPage} Document View</p>
            <p className="text-[11px] text-slate-500">{error}</p>
          </div>
        ) : (
          <canvas ref={canvasRef} className="max-w-full shadow-lg rounded border border-navy-800" />
        )}
      </div>
    </div>
  );
};
