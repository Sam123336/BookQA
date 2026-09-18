import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { RAG_CONFIG } from './config';
import { supabaseAdmin, isSupabaseConfigured } from './supabase';
import { AppError } from './errors';

// Supabase Storage holds the original. The directory and the in-process map in
// front of it are only a cache: ingestion re-reads the PDF on every step, and
// on a serverless host each step can land on an instance whose disk is empty.
// Local-only storage meant the second step of a book could never find the file
// the first step had written.
const BUCKET = 'books';
const DEFAULT_DIR = process.env.VERCEL ? join(tmpdir(), 'bookqa-pdfs') : join(process.cwd(), '.pdf-cache');
const DIR = process.env.PDF_CACHE_DIR || DEFAULT_DIR;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const memory = new Map<string, Buffer>();
let memoryBytes = 0;

// Ids reach this from a URL path segment, so anything that is not a plain UUID
// is refused before it can be joined into a filesystem path or an object key.
function keyFor(id: string): string | null {
  return UUID.test(id) ? `${id}.pdf` : null;
}

function fileFor(id: string): string | null {
  const key = keyFor(id);
  return key ? join(DIR, key) : null;
}

/** Where a book's PDF lives, for the `file_url` column. */
export function pdfObjectPath(id: string): string {
  const key = keyFor(id);
  return key ? `${BUCKET}/${key}` : '';
}

export async function storePdf(id: string, buffer: Buffer): Promise<void> {
  const key = keyFor(id);
  if (!key) return;

  if (isSupabaseConfigured()) {
    // upload() reports failure through the returned error and does not throw.
    // Leaving that error unchecked is what recorded a file_url for every early
    // book while the bucket did not exist and no bytes were ever written.
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(key, buffer, { contentType: 'application/pdf', upsert: true });
    if (error) throw new AppError(`Could not store the uploaded PDF: ${error.message}`, 502);
  }

  cacheLocally(id, buffer);
}

export async function getPdf(id: string): Promise<Buffer | undefined> {
  const cached = memory.get(id);
  if (cached) {
    memory.delete(id);
    memory.set(id, cached);
    return cached;
  }

  const file = fileFor(id);
  if (file && existsSync(file)) {
    try {
      const buffer = readFileSync(file);
      putInMemory(id, buffer);
      return buffer;
    } catch {
      // Unreadable cache entry is not an answer - fall through to the original.
    }
  }

  const key = keyFor(id);
  if (!key || !isSupabaseConfigured()) return undefined;

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(key);
  if (error || !data) return undefined;

  const buffer = Buffer.from(await data.arrayBuffer());
  cacheLocally(id, buffer);
  return buffer;
}

export async function deletePdf(id: string): Promise<void> {
  dropFromMemory(id);

  const file = fileFor(id);
  if (file && existsSync(file)) {
    try {
      rmSync(file);
    } catch {
      // The cache copy is disposable; the object below is what matters.
    }
  }

  const key = keyFor(id);
  if (key && isSupabaseConfigured()) {
    await supabaseAdmin.storage.from(BUCKET).remove([key]);
  }
}

export function cacheStats() {
  return { entries: memory.size, bytes: memoryBytes };
}

// Best effort. The durable copy is in Storage, so a read-only or full disk
// costs a re-download on the next step, never the document.
function cacheLocally(id: string, buffer: Buffer) {
  const file = fileFor(id);
  if (file) {
    try {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(file, buffer);
    } catch {
      // Serverless filesystems are read-only outside the temp directory.
    }
  }
  putInMemory(id, buffer);
}

function putInMemory(id: string, buffer: Buffer) {
  dropFromMemory(id);
  memory.set(id, buffer);
  memoryBytes += buffer.byteLength;
  while (memoryBytes > RAG_CONFIG.PDF_CACHE_MAX_BYTES && memory.size > 1) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    dropFromMemory(oldest);
  }
}

function dropFromMemory(id: string) {
  const buffer = memory.get(id);
  if (!buffer) return;
  memory.delete(id);
  memoryBytes -= buffer.byteLength;
}
