import { NextResponse } from 'next/server';
import { AppError } from './errors';

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * AppError carries a message written for the user, so it is returned as-is.
 * Anything else is unexpected: log it server-side and return a generic message
 * rather than leaking database or driver internals to the client.
 */
export function routeError(context: string, error: unknown, fallback: string) {
  if (error instanceof AppError) {
    return jsonError(error.message, error.status);
  }
  console.error(`[${context}]`, error);
  return jsonError(fallback, 500);
}
