export const RAG_CONFIG = {
  // Chunking parameters (approximate characters / token estimation)
  // 1 token ~= 4 characters in English text
  CHUNK_SIZE: Number(process.env.CHUNK_SIZE) || 1000,
  CHUNK_OVERLAP: Number(process.env.CHUNK_OVERLAP) || 150,

  // Batching & Concurrency for ingestion
  EMBEDDING_BATCH_SIZE: Number(process.env.EMBEDDING_BATCH_SIZE) || 50,

  // Rows written per indexing step. Bounds that step so a very large book does
  // not put one long insert inside a single request.
  CHUNK_INSERT_BATCH: Number(process.env.CHUNK_INSERT_BATCH) || 300,
  // Ingestion runs in the background, so it waits out a rate limit rather than
  // failing a 500-page book after a few seconds. ~8 attempts capped at
  // RETRY_MAX_DELAY_MS is several minutes of patience per batch.
  EMBEDDING_MAX_RETRIES: Number(process.env.EMBEDDING_MAX_RETRIES) || 8,
  EMBEDDING_RETRY_DELAY_MS: Number(process.env.EMBEDDING_RETRY_DELAY_MS) || 1000,

  // A person is waiting on this one, so it gives up sooner.
  LLM_MAX_RETRIES: Number(process.env.LLM_MAX_RETRIES) || 5,
  LLM_RETRY_DELAY_MS: Number(process.env.LLM_RETRY_DELAY_MS) || 2000,

  // Providers hand back a retry delay; this caps how long we honour it.
  RETRY_MAX_DELAY_MS: Number(process.env.RETRY_MAX_DELAY_MS) || 60000,

  EMBEDDING_MODEL: 'text-embedding-3-small',
  LLM_MODEL: 'gpt-4o-mini',

  EMBEDDING_DIM: 1536,

  TOP_K: Number(process.env.TOP_K) || 7,

  SUMMARY_CHUNKS: Number(process.env.SUMMARY_CHUNKS) || 12,

  // Standard Refusal Message required by specification
  // A scanned 300-500 page book runs well past 50MB, so the ceiling is set by
  // what the process can hold, not by a round number.
  MAX_UPLOAD_BYTES: Number(process.env.MAX_UPLOAD_BYTES) || 200 * 1024 * 1024,
  PDF_CACHE_MAX_BYTES: Number(process.env.PDF_CACHE_MAX_BYTES) || 256 * 1024 * 1024,

  REFUSAL_RESPONSE: "I couldn't find enough information about this in the selected book.",
};
