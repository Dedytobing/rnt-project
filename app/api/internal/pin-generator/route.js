import { NextResponse } from 'next/server';
import { createInternalPin, hasInternalPinConfig, verifyAdminPinGeneratorKey } from '@/lib/internal-pin';

function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export async function POST(request) {
  if (!hasInternalPinConfig()) return json({ error: 'Generator PIN belum dikonfigurasi di server.' }, 503);

  try {
    const { role, adminKey } = await request.json();
    if (!['STAFF', 'ADMIN'].includes(role)) return json({ error: 'Peran PIN tidak valid.' }, 400);

    if (role === 'ADMIN') {
      if (!process.env.PIN_GENERATOR_ADMIN_KEY || Buffer.byteLength(process.env.PIN_GENERATOR_ADMIN_KEY) < 32) {
        return json({ error: 'Akses PIN Admin belum dikonfigurasi di server.' }, 503);
      }
      if (!verifyAdminPinGeneratorKey(adminKey)) return json({ error: 'Kunci akses PIN Admin tidak valid.' }, 401);
    }

    const now = Date.now();
    return json({
      pin: createInternalPin(role, now),
      role,
      expiresAt: (Math.floor(now / 1000 / 30) + 1) * 30,
    });
  } catch {
    return json({ error: 'Permintaan generator tidak valid.' }, 400);
  }
}
