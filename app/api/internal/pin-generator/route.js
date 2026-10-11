import { NextResponse } from 'next/server';
import { createInternalPin, hasInternalPinConfig, verifyAdminPinGeneratorKey } from '@/lib/internal-pin';
import { enforceRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { pinGeneratorSchema, readValidatedJson } from '@/lib/validation';

function noStore(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, max-age=0' } });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return noStore({ error: 'Asal permintaan tidak valid.' }, 403);
  const limited = await enforceRateLimit(request, { namespace: 'internal-pin-generator', limit: 60, windowSeconds: 15 * 60 });
  const rateError = rateLimitResponse(limited);
  if (rateError) return rateError;
  if (!hasInternalPinConfig()) return noStore({ error: 'Generator PIN belum dikonfigurasi di server.' }, 503);

  const parsed = await readValidatedJson(request, pinGeneratorSchema, 256);
  if (!parsed.data) return noStore({ error: parsed.error }, parsed.status);
  if (parsed.data.role === 'ADMIN' && !verifyAdminPinGeneratorKey(parsed.data.adminKey)) {
    return noStore({ error: 'Kode verifikasi Admin tidak valid.' }, 401);
  }
  const ip = request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') || 'unknown';
  const now = Date.now();
  return noStore({
    pin: createInternalPin(parsed.data.role, now, ip),
    role: parsed.data.role,
    expiresAt: (Math.floor(now / 1000 / 30) + 1) * 30,
  });
}
