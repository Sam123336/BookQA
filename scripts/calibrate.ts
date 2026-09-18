import { supabaseAdmin } from '../lib/supabase';
import { generateQueryEmbedding } from '../lib/ai/llm';
import { getAIProvider } from '../lib/ai/provider';

async function main() {
  const [bookId, ...questions] = process.argv.slice(2);
  if (!bookId || questions.length === 0) {
    throw new Error('Usage: npm run calibrate -- <bookId> "question" ["another question"]');
  }
  const { config } = getAIProvider('embed');
  console.log(`${config.name} / ${config.embedModel} - current floor ${config.minSimilarity}\n`);

  for (const q of questions) {
    const embedding = await generateQueryEmbedding(q);
    const { data, error } = await supabaseAdmin.rpc('match_book_chunks', {
      query_embedding: embedding,
      match_book_id: bookId,
      match_threshold: -1,
      match_count: 5,
    });
    if (error) throw new Error(error.message);
    const scores = (data || []).map((r: any) => r.similarity.toFixed(3)).join(', ');
    console.log(`${(scores || 'no chunks').padEnd(40)} <- ${q}`);
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
