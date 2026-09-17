import { extractText as extractTextFromUnpdf } from 'unpdf';
import { ExtractedPage } from '../types';

export class ScannedPdfError extends Error {
  constructor(message = "This PDF appears to be scanned or contains little extractable text.") {
    super(message);
    this.name = "ScannedPdfError";
  }
}

/**
 * Clean raw text from PDF extraction while preserving exact meaning.
 */
export function cleanPdfText(text: string): string {
  if (!text) return '';

  return text
    // Replace soft hyphens & broken word hyphenations at line ends (unicode aware)
    .replace(/([\p{L}\p{N}]+)-\s*\n\s*([\p{L}\p{N}]+)/gu, '$1$2')
    // Fix line-break hyphenation without removing legitimate punctuation
    .replace(/([\p{L}\p{N}])\s*-\s*\n\s*([\p{L}\p{N}]+)/gu, '$1$2')
    // Replace multiple newlines with single space or paragraph break
    .replace(/\r\n|\r/g, '\n')
    // Remove control characters (except newline/tab)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
    // Replace consecutive spaces/tabs with single space
    .replace(/[ \t]+/g, ' ')
    // Remove leading/trailing space per line
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');
}

function normalizePageTextEntries(rawText: unknown): string[] {
  if (typeof rawText === 'string') {
    return [rawText];
  }

  if (Array.isArray(rawText)) {
    return rawText.filter((entry): entry is string => typeof entry === 'string');
  }

  return [];
}

async function extractWithUnpdf(pdfBuffer: Buffer): Promise<ExtractedPage[]> {
  const uint8Array = new Uint8Array(pdfBuffer);
  const result = await extractTextFromUnpdf(uint8Array, { mergePages: false });
  const pageTexts = normalizePageTextEntries(result?.text);

  return pageTexts.map((pageText, index) => ({
    pageNumber: index + 1,
    text: cleanPdfText(pageText || ''),
  }));
}

/**
 * Extract text from a PDF using the single supported server-side parser.
 * We intentionally avoid importing pdf.js directly here because the app also uses a
 * different pdfjs-dist build in the browser, and mixing the two causes the worker/API
 * version mismatch that breaks real uploads at runtime.
 */
export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<ExtractedPage[]> {
  try {
    const uint8Array = new Uint8Array(pdfBuffer);
    const result = await extractTextFromUnpdf(uint8Array, { mergePages: false });
    const pageTexts = normalizePageTextEntries(result?.text);

    if (pageTexts.length === 0) {
      throw new ScannedPdfError("This PDF appears to be scanned or contains little extractable text.");
    }

    const pages = pageTexts.map((pageText, index) => ({
      pageNumber: index + 1,
      text: cleanPdfText(pageText || ''),
    }));

    const textLength = pages.reduce((sum, page) => sum + page.text.length, 0);
    const avgChars = pages.length > 0 ? textLength / pages.length : 0;

    if (textLength === 0 || avgChars < 25) {
      throw new ScannedPdfError("This PDF appears to be scanned or contains little extractable text.");
    }

    return pages;
  } catch (error: any) {
    if (error instanceof ScannedPdfError) {
      throw error;
    }

    console.error("PDF Extraction error:", error);
    throw new Error(`Failed to extract text from PDF: ${error.message || error}`);
  }
}
