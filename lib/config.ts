export const RAG_CONFIG = {
  // Chunking parameters (approximate characters / token estimation)
  // 1 token ~= 4 characters in English text
  CHUNK_SIZE: Number(process.env.CHUNK_SIZE) || 1000,
  CHUNK_OVERLAP: Number(process.env.CHUNK_OVERLAP) || 150,

  // Batching & Concurrency for ingestion
  EMBEDDING_BATCH_SIZE: Number(process.env.EMBEDDING_BATCH_SIZE) || 50,
  EMBEDDING_MAX_RETRIES: 4,
  EMBEDDING_RETRY_DELAY_MS: 1000,

  LLM_MAX_RETRIES: 5,
  LLM_RETRY_DELAY_MS: 2000,

  EMBEDDING_MODEL: 'text-embedding-3-small',
  LLM_MODEL: 'gpt-4o-mini',

  EMBEDDING_DIM: 1536,

  TOP_K: Number(process.env.TOP_K) || 7,

  SUMMARY_CHUNKS: Number(process.env.SUMMARY_CHUNKS) || 12,

  // Standard Refusal Message required by specification
  MAX_UPLOAD_BYTES: Number(process.env.MAX_UPLOAD_BYTES) || 50 * 1024 * 1024,
  PDF_CACHE_MAX_BYTES: Number(process.env.PDF_CACHE_MAX_BYTES) || 256 * 1024 * 1024,

  REFUSAL_RESPONSE: "I couldn't find enough information about this in the selected book.",
};
