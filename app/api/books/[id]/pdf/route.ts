import { NextRequest, NextResponse } from 'next/server';
import { getPdf } from '@/lib/pdf-cache';
import { toUint8Array } from '@/lib/buffer';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const buffer = await getPdf(id);

  if (!buffer) {
    return NextResponse.json({ error: 'PDF content not found' }, { status: 404 });
  }

  return new NextResponse(toUint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${id}.pdf"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
