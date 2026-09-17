export const RAG_CONFIG = {
  // Chunking parameters (approximate characters / token estimation)
  // 1 token ~= 4 characters in English text
  CHUNK_SIZE: Number(process.env.CHUNK_SIZE) || 1000,
  CHUNK_OVERLAP: Number(process.env.CHUNK_OVERLAP) || 150,

  // Batching & Concurrency for ingestion
  EMBEDDING_BATCH_SIZE: Number(process.env.EMBEDDING_BATCH_SIZE) || 50,
  EMBEDDING_MAX_RETRIES: 4,
  EMBEDDING_RETRY_DELAY_MS: 1000,

  // OpenAI Model Settings
  EMBEDDING_MODEL: 'text-embedding-3-small',
  LLM_MODEL: 'gpt-4o-mini',

  // Vector Similarity Search
  TOP_K: Number(process.env.TOP_K) || 7,
  MIN_SIMILARITY: Number(process.env.MIN_SIMILARITY) || 0.35,

  // Standard Refusal Message required by specification
  REFUSAL_RESPONSE: "I couldn't find enough information about this in the selected book.",
};
