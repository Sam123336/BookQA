import { cleanPdfText } from '../lib/pdf/extractor';
import { createPageAwareChunks } from '../lib/pdf/chunker';
import { validateAndDeduplicateCitations } from '../lib/ai/citations';
import { generateGroundedAnswer } from '../lib/ai/openai';
import { ExtractedPage, BookChunk, StructuredLLMResponse } from '../lib/types';
import { RAG_CONFIG } from '../lib/config';

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
  // SUMMARY
  // ----------------------------------------------------
  console.log("\n==================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runRAGTestSuite();
