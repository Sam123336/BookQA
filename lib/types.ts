export type BookStatus = 
  | 'PENDING'
  | 'EXTRACTING'
  | 'EMBEDDING'
  | 'INDEXING'
  | 'COMPLETED'
  | 'FAILED';

export interface Book {
  id: string;
  title: string;
  author: string;
  file_name: string;
  file_url: string;
  page_count: number;
  status: BookStatus;
  total_chunks: number;
  processed_chunks: number;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookChunk {
  id?: string;
  book_id: string;
  page_number: number;
  chapter?: string;
  section?: string;
  chunk_index: number;
  content: string;
  embedding?: number[];
  similarity?: number;
}

export interface ChatSession {
  id: string;
  book_id: string;
  created_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  grounded: boolean;
  citations?: Citation[];
  created_at: string;
}

export interface Citation {
  id?: string;
  message_id?: string;
  chunk_id?: string | null;
  page_number: number;
  chapter?: string;
  excerpt: string;
  reason?: string;
  similarity_score?: number;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface StructuredLLMResponse {
  answer: string;
  citations: {
    page: number;
    reason?: string;
  }[];
}

export interface IngestionStatusUpdate {
  status: BookStatus;
  processedChunks: number;
  totalChunks: number;
  errorMessage?: string;
}
