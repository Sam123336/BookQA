# BookQA — Book-Grounded Question Answering with Page-Level Citations

**BookQA** is a production-quality, book-grounded question-answering system engineered to answer questions **strictly from an uploaded book or 300+ page PDF document**, backed by verified page-level citations.

The LLM is strictly constrained: it summarizes retrieved content from the document and **NEVER** uses pretrained knowledge to answer questions that are unsupported by the book.

---

## 🏗 Architecture & Core RAG Pipeline

```
PDF Document (300+ pages)
       │
       ▼
[Page-by-Page Extraction] ──► Preserves { pageNumber, text } & detects scanned PDFs
       │
       ▼
[Page-Aware Chunking] ─────► 800–1200 tokens (strict page assignment)
       │
       ▼
[OpenAI Batch Embeddings] ─► Batches 50–100 chunks with exponential backoff retries
       │
       ▼
[Supabase pgvector] ───────► Stores chunks + 1536-dim vectors in `book_chunks` table
       │
       ▼
User Question ─────────────► Generates Question Embedding
       │
       ▼
[Vector Similarity Match] ─► Executes `match_book_chunks` RPC function (Similarity >= 0.35, Top K: 6)
       │
       ▼
[Strict Grounded LLM] ────► Calls OpenAI `gpt-4o-mini` with JSON mode (`{ answer, citations }`)
       │
       ▼
[Citation Engine] ─────────► Validates & strips hallucinated citation pages NOT in retrieved evidence
       │
       ▼
[Interactive Citation UI] ──► Click badge [Page 15 · Edmond Dantès] ──► Opens Source Excerpt & PDF Viewer
```

---

## ✨ Features

- **300+ Page PDF Ingestion**: Optimized for large books using page-aware chunking and batched API operations.
- **Strict Book-Only Grounding**: Refuses out-of-book questions (e.g. *"What is the capital of Japan?"*) with standard refusal: *"I couldn't find enough information about this in the selected book."*
- **Verified Page Citations**: Citation validation engine intersects LLM citations against retrieved vector chunks to guarantee 100% citation accuracy.
- **Scanned PDF Detection**: Identifies image-only or non-extractable PDFs and alerts the user immediately.
- **Interactive Source Panel**: Click citation badges to view exact chunk excerpts and view the PDF page on canvas.
- **Developer-Built Dark UI**: Calm navy/blue theme designed for focus, readability, and speed.

---

## 🛠 Tech Stack

- **Framework**: Next.js 14/15 (App Router & Route Handlers)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database & Vectors**: Supabase PostgreSQL + `pgvector`
- **AI Embeddings & Answers**: OpenAI API (`text-embedding-3-small` & `gpt-4o-mini`)
- **PDF Extraction & Viewing**: `pdfjs-dist`
- **Package Manager**: `npm`

---

## 📁 Database Schema (`supabase/schema.sql`)

### Tables

1. **`books`**: Document metadata and ingestion state (`PENDING`, `EXTRACTING`, `EMBEDDING`, `INDEXING`, `COMPLETED`, `FAILED`).
2. **`book_chunks`**: Text chunks with `page_number`, `chapter`, `section`, `chunk_index`, and `embedding` vector (1536 dims).
3. **`chat_sessions`**: Question answering sessions bound to a specific book.
4. **`messages`**: User queries and assistant responses with grounded status flags.
5. **`citations`**: Verified citation links connecting assistant messages to exact page numbers and chunk excerpts.

### Vector Similarity Search Function

```sql
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
```

---

## 🚀 Environment Setup & Local Installation

### 1. Clone & Install Dependencies

```bash
cd scratch/bookqa
npm install
```

### 2. Configure Environment Variables (`.env.local`)

Copy `.env.example` to `.env.local`:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key

# RAG Configuration Defaults
CHUNK_SIZE=1000
CHUNK_OVERLAP=150
EMBEDDING_BATCH_SIZE=50
TOP_K=6
MIN_SIMILARITY=0.35
```

### 3. Initialize Supabase Database

Execute `supabase/schema.sql` inside your Supabase SQL Editor. This enables `pgvector`, creates all tables, indexes, and the `match_book_chunks` vector search function.

### 4. Run Automated RAG Test Suite

```bash
npm run test:rag
```

### 5. Start Next.js Development Server

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## 🧪 Testing Scenarios

1. **Upload 300+ Page PDF**: Upload a large book (e.g., *The Count of Monte Cristo*). The progress bar reports pages processed through `Extracting` -> `Indexing` -> `Embedding` -> `Ready`.
2. **Grounded Book Question**:
   - **Query**: *"What is this book about?"*
   - **Response**: Concise natural language summary with verified citation badges (e.g. `[Page 2 · Opening]`).
3. **Out-of-Book Question Refusal**:
   - **Query**: *"What is the capital of Japan?"*
   - **Response**: *"I couldn't find enough information about this in the selected book."*
4. **Citation Verification**:
   - Click any citation badge to open the right-side **Source Panel**.
   - Confirm page number, chapter, exact extracted excerpt, and rendered PDF canvas page.

---

## 🚀 Production Build & Deployment

### Build

```bash
npm run build
```

### Deployment

Ingestion runs as **resumable steps**, not as background work. Uploading only
stores the file and creates the book row; the client then polls
`POST /api/books/[id]/ingest`, and each call performs one bounded unit of work
(parse, index a slice of chunks, then one embedding batch) before returning. Because every
piece of progress is written to the database, no request has to outlive a
serverless time limit, and an ingestion interrupted by a restart or redeploy
resumes from where it stopped.

That makes the app host-agnostic:

- **Vercel** — works, including large books. `vercel.json` is included.
- **Render / Railway / Fly / any container host** — works. A `Dockerfile` and
  `render.yaml` are included; `render.yaml` mounts a disk at `/data` so cached
  PDF originals survive restarts.
- **Database**: **Supabase** with `pgvector` enabled.

On a host without a persistent disk, set up the Supabase Storage `books`
bucket so PDF originals survive instance recycling (page view depends on it).

### CI/CD

`.github/workflows/ci.yml` typechecks, tests and builds every PR, builds the
Docker image and boots it to confirm it serves, and only then deploys. Set
`RENDER_DEPLOY_HOOK` as a repository secret to enable the deploy step; without
it the job skips rather than failing.
