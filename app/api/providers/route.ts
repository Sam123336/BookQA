import { NextResponse } from 'next/server';
import { availableChatProviders } from '@/lib/ai/provider';
import { routeError } from '@/lib/http';

/**
 * The chat providers this deployment can actually reach, for the model picker.
 * Embedding is deliberately absent: the stored vectors were built with one
 * embedding model and swapping it would silently break similarity search.
 */
// Keys are read at request time: a Docker image built without them would
// otherwise bake an empty provider list into the static response.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ providers: availableChatProviders(process.env) });
  } catch (error) {
    return routeError('providers', error, 'Failed to list providers.');
  }
}
