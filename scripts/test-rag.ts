import { cleanPdfText } from '../lib/pdf/extractor';
import { toUint8Array } from '../lib/buffer';
import { createPageAwareChunks } from '../lib/pdf/chunker';
import { validateAndDeduplicateCitations } from '../lib/ai/citations';
import { generateGroundedAnswer, retryAfterMs, nextDelayMs } from '../lib/ai/llm';
import { ExtractedPage, BookChunk, StructuredLLMResponse } from '../lib/types';
import { RAG_CONFIG } from '../lib/config';
import { storePdf, getPdf, deletePdf, cacheStats } from '../lib/pdf-cache';
import { AppError } from '../lib/errors';
import { resolveProvider, availableChatProviders } from '../lib/ai/provider';
import { SUMMARY_RE, strideSample, CHITCHAT_RE } from '../lib/rag/query';

async function runRAGTestSuite() {
  console.log("==================================================");
  console.log("       BOOKQA AUTOMATED RAG TEST SUITE            ");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✓ [PASS]: ${testName}`);
      passed++;
    } else {
      console.error(`✗ [FAIL]: ${testName} ${detail ? `- ${detail}` : ''}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST 1: PDF Text Cleaning & Page Preservation
  // ----------------------------------------------------
  console.log("\n--- TEST 1: Text Cleaning & Page Preservation ---");
  const rawText = "Edmond   Dantè-\nwas a young sailor.\r\n\r\nHe arrived at Marseille.";
  const cleaned = cleanPdfText(rawText);
  assert(cleaned.includes("Edmond Dantèwas a young sailor."), "Word hyphenation at line breaks cleaned");
  assert(!cleaned.includes("   "), "Repeated spaces collapsed");

  // ----------------------------------------------------
  // TEST 2: Page-Aware Semantic Chunking
  // ----------------------------------------------------
  console.log("\n--- TEST 2: Page-Aware Semantic Chunking ---");
  const mockPages: ExtractedPage[] = [
    { pageNumber: 15, text: "Chapter I. Edmond Dantès arrived in Marseille. He was nineteen years old and full of hope for his future command." },
    { pageNumber: 17, text: "Chapter II. Father and Son. Old Dantès lived in a small room on the fourth floor of a house in Marseille." }
  ];

  const chunks = createPageAwareChunks("book-123", mockPages, 100, 20);
  assert(chunks.length > 0, "Chunks created successfully");
  assert(chunks.every(c => c.page_number === 15 || c.page_number === 17), "Every chunk preserves its exact source page_number");
  assert(chunks.some(c => c.page_number === 15), "Page 15 chunk present");
  assert(chunks.some(c => c.page_number === 17), "Page 17 chunk present");

  // ----------------------------------------------------
  // TEST 3: Citation Validation & Hallucination Removal
  // ----------------------------------------------------
  console.log("\n--- TEST 3: Citation Validation & Deduplication ---");
  const retrievedChunks: BookChunk[] = [
    { id: "c-15", book_id: "book-123", page_number: 15, chunk_index: 0, content: "Edmond Dantès arrived in Marseille.", similarity: 0.88 },
    { id: "c-17", book_id: "book-123", page_number: 17, chunk_index: 1, content: "Old Dantès lived in a small room.", similarity: 0.79 },
  ];

  const llmResponseWithHallucination: StructuredLLMResponse = {
    answer: "Edmond Dantès arrived in Marseille to visit his father.",
    citations: [
      { page: 15, reason: "Arrival in Marseille" },
      { page: 1000, reason: "Fake page citation" }, // Page 1000 was NEVER retrieved!
      { page: 15, reason: "Duplicate page 15" }
    ]
  };

  const verifiedCitations = validateAndDeduplicateCitations(llmResponseWithHallucination, retrievedChunks);
  assert(verifiedCitations.length === 1, "Hallucinated & duplicate citations stripped (Length should be 1)");
  assert(verifiedCitations[0].page_number === 15, "Only retrieved Page 15 is retained as verified citation");

  // ----------------------------------------------------
  // TEST 4: Refusal Response for Out-of-Book Question
  // ----------------------------------------------------
  console.log("\n--- TEST 4: Out-of-Book Refusal Behavior ---");
  const emptyChunks: BookChunk[] = []; // No relevant chunks found for "What is the capital of Japan?"
  const refusalAnswer = await generateGroundedAnswer("The Count of Monte Cristo", "What is the capital of Japan?", emptyChunks);

  assert(
    refusalAnswer.answer === RAG_CONFIG.REFUSAL_RESPONSE,
    "Out-of-book question returned exact standard refusal response",
    `Expected: "${RAG_CONFIG.REFUSAL_RESPONSE}", Got: "${refusalAnswer.answer}"`
  );
  assert(refusalAnswer.citations.length === 0, "Refusal response returns empty citations array");

  // ----------------------------------------------------
  console.log("\n--- TEST 5: AI Provider Resolution ---");

  const oa = resolveProvider({ OPENAI_API_KEY: 'sk-test' });
  assert(oa.name === 'openai', "OPENAI_API_KEY alone selects OpenAI");
  assert(oa.baseURL === undefined, "OpenAI uses the SDK default base URL");
  assert(oa.embedModel === RAG_CONFIG.EMBEDDING_MODEL, "OpenAI uses the configured embedding model");

  const gm = resolveProvider({ GEMINI_API_KEY: 'AIza-test' });
  assert(gm.name === 'gemini', "GEMINI_API_KEY alone selects Gemini");
  assert(
    gm.baseURL === 'https://generativelanguage.googleapis.com/v1beta/openai/',
    "Gemini points the OpenAI SDK at the compatibility endpoint"
  );
  assert(gm.embedModel === 'gemini-embedding-001', "Gemini defaults to gemini-embedding-001");
  assert(gm.chatModel === 'gemini-3.5-flash', "Gemini defaults to gemini-3.5-flash");

  const alias = resolveProvider({ GOOGLE_API_KEY: 'AIza-test' });
  assert(alias.name === 'gemini' && alias.apiKey === 'AIza-test', "GOOGLE_API_KEY works as a Gemini alias");

  const both = resolveProvider({ OPENAI_API_KEY: 'sk-test', GEMINI_API_KEY: 'AIza-test' });
  assert(both.name === 'openai', "With both keys present, OpenAI wins by default");

  const forced = resolveProvider({ OPENAI_API_KEY: 'sk-test', GEMINI_API_KEY: 'AIza-test', AI_PROVIDER: 'gemini' });
  assert(forced.name === 'gemini', "AI_PROVIDER=gemini overrides the default tie-break");

  const override = resolveProvider({ GEMINI_API_KEY: 'AIza-test', GEMINI_LLM_MODEL: 'gemini-3-pro' });
  assert(override.chatModel === 'gemini-3-pro', "GEMINI_LLM_MODEL overrides the default chat model");

  let badShape = false;
  try { resolveProvider({ OPENAI_API_KEY: 'AQ.Ab8RN-gemini-shaped' }); } catch { badShape = true; }
  assert(badShape, "A non-sk key aimed at api.openai.com is rejected with guidance, not a raw 401");

  const proxy = resolveProvider({ OPENAI_API_KEY: 'anything', OPENAI_BASE_URL: 'https://proxy.local/v1' });
  assert(proxy.baseURL === 'https://proxy.local/v1', "OPENAI_BASE_URL allows non-sk keys for proxy/Azure setups");

  let threw = false;
  try { resolveProvider({}); } catch { threw = true; }
  assert(threw, "No key at all throws instead of silently degrading");

  let forcedThrew = false;
  try { resolveProvider({ OPENAI_API_KEY: 'sk-test', AI_PROVIDER: 'gemini' }); } catch { forcedThrew = true; }
  assert(forcedThrew, "AI_PROVIDER=gemini without a Gemini key throws");

  console.log("\n--- TEST 6: Summary Intent & Similarity Floors ---");

  for (const q of ['sumaraize', 'summarize', 'summary', 'Summarise this', 'give me an overview',
                   'tldr', 'tl;dr', 'what is this book about', 'key takeaways', 'main themes']) {
    assert(SUMMARY_RE.test(q), `Summary intent detected: "${q}"`);
  }
  for (const q of ['what did the gardener teach?', 'who is the keeper of the orchard?',
                   'what is a samurai?', 'when did it rain?']) {
    assert(!SUMMARY_RE.test(q), `Factual question NOT treated as summary: "${q}"`);
  }

  assert(resolveProvider({ OPENAI_API_KEY: 'sk-t' }).minSimilarity === 0.35, "OpenAI floor defaults to 0.35");
  assert(resolveProvider({ GEMINI_API_KEY: 'g' }).minSimilarity === 0.55, "Gemini floor defaults to 0.55 (compressed range)");
  assert(
    resolveProvider({ GEMINI_API_KEY: 'g', MIN_SIMILARITY: '0.7' }).minSimilarity === 0.7,
    "MIN_SIMILARITY env overrides the provider default"
  );
  assert(
    resolveProvider({ GEMINI_API_KEY: 'g', MIN_SIMILARITY: '' }).minSimilarity === 0.55,
    "Empty MIN_SIMILARITY falls back to the provider default instead of 0"
  );

  // Groq serves chat but has no /embeddings endpoint. If a Groq key ever leaked
  // into the embed role, ingestion would 404 and the similarity floor would read 0.
  const groqEnv = { GROQ_API_KEY: 'gsk-t', GEMINI_API_KEY: 'g' };
  assert(resolveProvider(groqEnv, 'chat').name === 'groq', "Groq key takes the chat role");
  assert(resolveProvider(groqEnv, 'embed').name === 'gemini', "Embedding falls through to Gemini");
  assert(
    resolveProvider(groqEnv, 'embed').minSimilarity === 0.55,
    "Similarity floor follows the embedding model, not the Groq chat model"
  );
  assert(
    resolveProvider({ ...groqEnv, AI_PROVIDER: 'groq' }, 'embed').name === 'gemini',
    "AI_PROVIDER=groq still cannot force Groq onto the embed role"
  );
  assert(
    resolveProvider({ GROQ_API_KEY: 'gsk-t', OPENAI_API_KEY: 'sk-t' }, 'embed').name === 'openai',
    "Embedding falls through to OpenAI when that is the key on hand"
  );
  assert(
    ((): boolean => {
      try { resolveProvider({ GROQ_API_KEY: 'gsk-t' }, 'embed'); return false; }
      catch (e: any) { return /no embeddings endpoint/i.test(e.message); }
    })(),
    "A Groq-only .env fails embedding with a message that names the reason"
  );
  assert(resolveProvider({ GEMINI_API_KEY: 'g' }, 'chat').name === 'gemini', "No Groq key, no change in behaviour");

  // The picker offers exactly what the deployment can reach - no more (a dead
  // option fails on the first question) and no fewer.
  const all = availableChatProviders({ GROQ_API_KEY: 'gsk-t', OPENAI_API_KEY: 'sk-t', GEMINI_API_KEY: 'g' });
  assert(all.map(p => p.name).join() === 'groq,openai,gemini', "Every keyed chat provider is offered");
  assert(all[0].label === 'gpt-oss-120b · groq', "Label drops the vendor prefix from the model id");
  assert(
    availableChatProviders({ GEMINI_API_KEY: 'g' }).length === 1,
    "A provider with no key is not offered"
  );
  assert(availableChatProviders({}).length === 0, "No keys means an empty picker, not a crash");
  assert(
    availableChatProviders({ OPENAI_API_KEY: 'not-a-key', GEMINI_API_KEY: 'g' })
      .map(p => p.name).join() === 'gemini',
    "A key that cannot resolve is left out instead of offered and then failing"
  );
  assert(
    resolveProvider({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'gsk-t', AI_PROVIDER: 'groq' }, 'chat', 'gemini').name === 'gemini',
    "A reader's pick overrides the AI_PROVIDER default for that request"
  );

  console.log("\n--- TEST 7: Summary Coverage Sampling ---");
  const hundred = Array.from({ length: 100 }, (_, i) => i);

  assert(strideSample([1, 2, 3], 12).length === 3, "Fewer chunks than the budget returns them all");
  assert(strideSample([], 12).length === 0, "Empty book yields no coverage chunks");
  assert(strideSample(hundred, 10).length === 10, "Sampling returns exactly the requested count");
  assert(strideSample(hundred, 10)[0] === 0, "Coverage starts at the beginning of the book");
  assert(
    strideSample(hundred, 10)[9] >= 85,
    "Coverage reaches the end of the book, not just the opening chunks"
  );
  assert(
    new Set(strideSample(hundred, 10)).size === 10,
    "Coverage chunks are distinct (no chunk sampled twice)"
  );
  assert(
    strideSample(hundred, 10).every((v, i, a) => i === 0 || v > a[i - 1]),
    "Coverage preserves reading order"
  );

  console.log("\n--- TEST 8: Greeting Short-Circuit ---");
  for (const q of ['hey', 'hi', 'Hello!', 'heyyy', 'thanks', 'Thank you.', 'ok', 'good morning', 'bye']) {
    assert(CHITCHAT_RE.test(q), `Greeting short-circuited: "${q}"`);
  }
  for (const q of ['who says hello in chapter 2?', 'hey what does the gardener teach?',
                   'what is this book about', 'is okay a word the author uses?', 'thanks giving traditions']) {
    assert(!CHITCHAT_RE.test(q), `Real question NOT short-circuited: "${q}"`);
  }

  console.log("\n--- TEST 9: Zero-copy Buffer View ---");

  const whole = Buffer.from('%PDF-1.4 hello world');
  const wholeView = toUint8Array(whole);
  assert(Buffer.from(wholeView).equals(whole), "View over a whole buffer has identical bytes");
  assert(wholeView.buffer === whole.buffer, "View shares memory instead of copying");
  assert(!Buffer.isBuffer(wholeView), "View is a real Uint8Array (unpdf rejects Buffer)");

  const pooled = Buffer.from('%PDF-1.4 pooled payload').subarray(9);
  const pooledView = toUint8Array(pooled);
  assert(pooledView.byteLength === pooled.byteLength, "View length matches an offset buffer");
  assert(
    Buffer.from(pooledView).toString() === 'pooled payload',
    "View respects byteOffset - a sliced buffer is not read from the pool start"
  );

  console.log("\n--- TEST 10: PDF Cache ---");

  const uuid = (n: number) =>
    `0000000${n}-0000-4000-8000-00000000000${n}`.replace(/\s/g, '');

  const chunkBytes = Math.ceil(RAG_CONFIG.PDF_CACHE_MAX_BYTES / 4);
  for (let i = 1; i <= 6; i++) {
    storePdf(uuid(i), Buffer.alloc(chunkBytes));
  }

  assert(
    cacheStats().bytes <= RAG_CONFIG.PDF_CACHE_MAX_BYTES,
    "In-memory cache stays within its byte budget",
    `bytes=${cacheStats().bytes} limit=${RAG_CONFIG.PDF_CACHE_MAX_BYTES}`
  );
  assert(
    getPdf(uuid(1)) !== undefined,
    "Evicted-from-memory PDF is still served from disk (survives restart)"
  );

  const payload = Buffer.from('%PDF-1.4 persisted bytes');
  storePdf(uuid(7), payload);
  assert(getPdf(uuid(7))?.equals(payload) === true, "Stored PDF round-trips byte-for-byte");

  deletePdf(uuid(7));
  assert(getPdf(uuid(7)) === undefined, "Deleting a book removes its cached PDF from disk and memory");

  for (const bad of ['../../etc/passwd', 'not-a-uuid', '../secrets', '']) {
    storePdf(bad, Buffer.from('x'));
    assert(getPdf(bad) === undefined, `Path-traversal id refused: ${JSON.stringify(bad)}`);
  }

  for (let i = 1; i <= 6; i++) deletePdf(uuid(i));

  console.log("\n--- TEST 11: Page Progress ---");

  const asBook = (page_count: number, processed_chunks: number, total_chunks: number) =>
    ({ page_count, processed_chunks, total_chunks }) as any;

  const pagesOf = (b: any) =>
    b.page_count <= 0 || b.total_chunks <= 0
      ? null
      : Math.min(b.page_count, Math.round((b.processed_chunks / b.total_chunks) * b.page_count));

  assert(pagesOf(asBook(350, 0, 1400)) === 0, "Progress starts at page 0");
  assert(pagesOf(asBook(350, 700, 1400)) === 175, "Half the chunks reads as half the pages");
  assert(pagesOf(asBook(350, 1400, 1400)) === 350, "All chunks done reports every page");
  assert(pagesOf(asBook(350, 1401, 1400)) === 350, "Overshoot is clamped to the real page count");
  assert(pagesOf(asBook(0, 0, 0)) === null, "Before extraction finishes there is no page figure");
  assert(pagesOf(asBook(350, 0, 0)) === null, "No chunks yet means no page figure (no divide-by-zero)");

  console.log("\n--- TEST 12: Retry Backoff ---");

  assert(
    retryAfterMs({ message: 'Quota exceeded. Please retry in 1.893003718s.' }) === 1894,
    "Gemini's 'retry in Xs' hint is parsed out of the message"
  );
  assert(
    retryAfterMs({ headers: { 'retry-after': '30' } }) === 30000,
    "Retry-After header is honoured"
  );
  assert(retryAfterMs({ message: 'boom' }) === null, "No hint present yields null, not NaN");

  const hinted = nextDelayMs({ message: 'Please retry in 42s' }, 0, 1000);
  assert(
    hinted >= 42000 && hinted < 42000 + 300,
    "Server hint wins over the exponential backoff",
    `got ${hinted}`
  );

  const blind = nextDelayMs({ message: 'no hint' }, 3, 1000);
  assert(blind >= 8000 && blind < 8000 + 300, `Backoff doubles per attempt (got ${blind})`);

  const capped = nextDelayMs({ message: 'Please retry in 9999s' }, 0, 1000);
  assert(
    capped <= RAG_CONFIG.RETRY_MAX_DELAY_MS + 250,
    "An absurd server hint is capped by RETRY_MAX_DELAY_MS",
    `got ${capped}`
  );

  assert(
    RAG_CONFIG.EMBEDDING_MAX_RETRIES > RAG_CONFIG.LLM_MAX_RETRIES,
    "Background ingestion is more patient than an interactive question"
  );

  console.log("\n--- TEST 13: Error Surfacing ---");

  let appErr: unknown;
  try { resolveProvider({}); } catch (e) { appErr = e; }
  assert(appErr instanceof AppError, "Config problems throw AppError so the message reaches the user");
  assert((appErr as AppError).status === 500, "Missing-key AppError carries a 500 status");

  let keyShapeErr: unknown;
  try { resolveProvider({ OPENAI_API_KEY: 'AQ.wrong-kind' }); } catch (e) { keyShapeErr = e; }
  assert(keyShapeErr instanceof AppError, "Wrong key shape throws AppError, not a bare Error");

  console.log("\n==================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runRAGTestSuite();
