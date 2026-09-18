import { Book, BookChunk } from '../types';

const memoryBooks = new Map<string, Book>();
const memoryChunks = new Map<string, BookChunk[]>();

export function getMemoryBooks(): Book[] {
  return Array.from(memoryBooks.values());
}

export function getMemoryBook(id: string): Book | undefined {
  return memoryBooks.get(id);
}

export function registerMemoryBook(book: Book) {
  memoryBooks.set(book.id, book);
}

export function deleteMemoryBook(id: string): boolean {
  memoryChunks.delete(id);
  return memoryBooks.delete(id);
}

export function getMemoryChunks(bookId: string): BookChunk[] {
  return memoryChunks.get(bookId) || [];
}

export function setMemoryChunks(bookId: string, chunks: BookChunk[]) {
  memoryChunks.set(bookId, chunks);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
