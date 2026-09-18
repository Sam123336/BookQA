import { NextRequest, NextResponse } from 'next/server';
import { advanceIngestion } from '@/lib/rag/ingest';
import { routeError } from '@/lib/http';

/**
 * Advances one book's ingestion by a single bounded step. The client polls this
 * until `done`, which keeps every invocation short enough for a serverless
 * time limit and lets an interrupted book resume where it stopped.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    return NextResponse.json(await advanceIngestion(params.id));
  } catch (error) {
    return routeError('books/[id]/ingest', error, 'Failed to advance ingestion.');
  }
}
