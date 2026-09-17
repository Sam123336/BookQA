-- BOOKQA - Supabase PostgreSQL Schema with pgvector
-- Enable vector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable uuid-ossp extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: books
CREATE TABLE IF NOT EXISTS public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT DEFAULT 'Unknown',
  file_name TEXT NOT NULL,
  file_url TEXT DEFAULT '',
  page_count INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, EXTRACTING, EMBEDDING, INDEXING, COMPLETED, FAILED
  total_chunks INT DEFAULT 0,
  processed_chunks INT DEFAULT 0,
  error_message TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: book_chunks
CREATE TABLE IF NOT EXISTS public.book_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  chapter TEXT DEFAULT '',
  section TEXT DEFAULT '',
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: chat_sessions
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: messages
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  grounded BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: citations
CREATE TABLE IF NOT EXISTS public.citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES public.book_chunks(id) ON DELETE SET NULL,
  page_number INT NOT NULL,
  chapter TEXT DEFAULT '',
  excerpt TEXT NOT NULL,
  similarity_score FLOAT DEFAULT 0.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_book_chunks_book_id ON public.book_chunks(book_id);
CREATE INDEX IF NOT EXISTS idx_book_chunks_page ON public.book_chunks(book_id, page_number);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_book ON public.chat_sessions(book_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON public.messages(session_id);
CREATE INDEX IF NOT EXISTS idx_citations_message ON public.citations(message_id);

-- Vector similarity index (HNSW for high throughput performance)
CREATE INDEX IF NOT EXISTS idx_book_chunks_embedding_hnsw 
ON public.book_chunks 
USING hnsw (embedding vector_cosine_ops);

-- Storage bucket creation instruction:
-- In Supabase Dashboard -> Storage -> Create a public/private bucket named 'books'.

-- Vector Similarity Search RPC Function
CREATE OR REPLACE FUNCTION match_book_chunks(
  query_embedding vector(1536),
  match_book_id uuid,
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  book_id uuid,
  page_number int,
  chapter text,
  section text,
  chunk_index int,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    bc.id,
    bc.book_id,
    bc.page_number,
    bc.chapter,
    bc.section,
    bc.chunk_index,
    bc.content,
    1 - (bc.embedding <=> query_embedding) AS similarity
  FROM public.book_chunks bc
  WHERE bc.book_id = match_book_id
    AND (1 - (bc.embedding <=> query_embedding)) >= match_threshold
  ORDER BY bc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
