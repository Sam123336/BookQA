import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { RAG_CONFIG } from './config';

const DIR = process.env.PDF_CACHE_DIR || join(process.cwd(), '.pdf-cache');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const memory = new Map<string, Buffer>();
let memoryBytes = 0;

// Ids reach this from a URL path segment, so anything that is not a plain UUID
// is refused before it can be joined into a filesystem path.
function fileFor(id: string): string | null {
  return UUID.test(id) ? join(DIR, `${id}.pdf`) : null;
}

export function storePdf(id: string, buffer: Buffer) {
  const file = fileFor(id);
  if (!file) return;

  mkdirSync(DIR, { recursive: true });
  writeFileSync(file, buffer);
  putInMemory(id, buffer);
}

export function getPdf(id: string): Buffer | undefined {
  const cached = memory.get(id);
  if (cached) {
    memory.delete(id);
    memory.set(id, cached);
    return cached;
  }

  const file = fileFor(id);
  if (!file || !existsSync(file)) return undefined;

  const buffer = readFileSync(file);
  putInMemory(id, buffer);
  return buffer;
}

export function deletePdf(id: string) {
  dropFromMemory(id);
  const file = fileFor(id);
  if (file && existsSync(file)) rmSync(file);
}

export function cacheStats() {
  return { entries: memory.size, bytes: memoryBytes };
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
