import { NextResponse } from 'next/server';
import { getInternalSession } from '@/lib/internal-session';

export async function GET(request) {
  if (!getInternalSession(request)) {
    return NextResponse.json({ success: false, error: 'Sesi personel diperlukan.' }, { status: 401 });
  }

  return NextResponse.json(
    { success: true, serverTime: Date.now() },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
  );
}
