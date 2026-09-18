import { supabaseAdmin, isSupabaseConfigured } from '../lib/supabase';
import { generateBatchEmbeddings } from '../lib/ai/llm';
import { getAIProvider } from '../lib/ai/provider';
import { RAG_CONFIG } from '../lib/config';

async function main() {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.');
  const { config: provider } = getAIProvider('embed');
  console.log(`Provider: ${provider.name} / ${provider.embedModel} @ ${RAG_CONFIG.EMBEDDING_DIM} dims\n`);

  const { data: books, error: bErr } = await supabaseAdmin
    .from('books').select('id, title').eq('status', 'COMPLETED');
  if (bErr) throw new Error(bErr.message);

  for (const book of books || []) {
    const { data: chunks, error } = await supabaseAdmin
      .from('book_chunks').select('id, content').eq('book_id', book.id).order('chunk_index');
    if (error) throw new Error(error.message);
    if (!chunks?.length) { console.log(`- ${book.title}: no chunks, skipped`); continue; }

    const vectors = await generateBatchEmbeddings(chunks.map(c => c.content));

    for (let i = 0; i < chunks.length; i++) {
      const { error: uErr } = await supabaseAdmin
        .from('book_chunks').update({ embedding: vectors[i] }).eq('id', chunks[i].id);
      if (uErr) throw new Error(`${book.title} chunk ${chunks[i].id}: ${uErr.message}`);
    }
    console.log(`✓ ${book.title}: ${chunks.length} chunks re-embedded`);
  }
  console.log('\nDone.');
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
