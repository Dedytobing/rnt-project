import { NextResponse } from 'next/server';
import { hasInternalPinConfig, verifyInternalPin } from '@/lib/internal-pin';
import {
  createInternalSessionToken,
  getInternalSession,
  hasSessionSecret,
  INTERNAL_SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/internal-session';
import { enforceRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { pinSessionSchema, readValidatedJson } from '@/lib/validation';
import { createServiceRoleClient } from '@/lib/supabase-server';
import { createHmac } from 'node:crypto';

function requestIp(request) {
  return request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') || 'unknown';
}

async function recordLoginFailure({ request, name, role, personnelId = null }) {
  try {
    const db = createServiceRoleClient();
    const ipHash = createHmac('sha256', process.env.INTERNAL_SESSION_SECRET || '').update(requestIp(request)).digest('hex');
    await db.from('personnel_audit_logs').insert({ personnel_id: personnelId, personnel_name: name, role, event: 'LOGIN_FAILURE', ip_hash: ipHash });
  } catch (error) {
    console.error('Personnel login failure audit failed:', error);
  }
}

function noStore(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

function isSameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function GET(request) {
  const session = getInternalSession(request);
  return noStore(session
    ? {
      authenticated: true,
      officerName: session.name,
      userRole: session.role,
      officerRank: session.rank,
      officerPosition: session.position,
      officerDepartment: session.department,
    }
    : { authenticated: false });
}

export async function POST(request) {
  if (!isSameOrigin(request)) return noStore({ success: false, error: 'Asal permintaan tidak valid.' }, 403);

  const limited = await enforceRateLimit(request, {
    namespace: 'personnel-pin-login',
    limit: 8,
    windowSeconds: 15 * 60,
  });
  const rateLimitError = rateLimitResponse(limited);
  if (rateLimitError) return rateLimitError;

  const parsed = await readValidatedJson(request, pinSessionSchema, 2048);
  if (!parsed.data) return noStore({ success: false, error: parsed.error }, parsed.status);

  const profileLimited = await enforceRateLimit(request, {
    namespace: 'personnel-pin-login-role',
    identifier: parsed.data.role,
    limit: 6,
    windowSeconds: 15 * 60,
  });
  const profileRateError = rateLimitResponse(profileLimited);
  if (profileRateError) return profileRateError;

  if (!hasSessionSecret() || !hasInternalPinConfig()) {
    return noStore({ success: false, error: 'Akses sesi belum dikonfigurasi di server.' }, 503);
  }
  const { name, role } = parsed.data;
  const normalizedName = name.trim().toLowerCase();
  const pinIdentity = requestIp(request);
  let personnel;
  let whitelistedName;
  try {
    const db = createServiceRoleClient();
    const [whitelistResult, personnelResult] = await Promise.all([
      db.from('rnt_personnel_name_whitelist').select('full_name,normalized_name,role').eq('normalized_name', normalizedName).eq('is_active', true).maybeSingle(),
      db.from('rnt_personnel').select('id,full_name,normalized_name,role,rank,position,department,is_active').eq('normalized_name', normalizedName).eq('is_active', true).maybeSingle(),
    ]);
    if (whitelistResult.error) throw whitelistResult.error;
    if (personnelResult.error) throw personnelResult.error;
    whitelistedName = whitelistResult.data;
    personnel = personnelResult.data;
  } catch (error) {
    console.error('Personnel whitelist lookup failed:', error);
    return noStore({ success: false, error: 'Daftar verifikasi personel belum tersedia.' }, 503);
  }
  if (!whitelistedName || whitelistedName.role !== role || (personnel && personnel.role !== role)) {
    await recordLoginFailure({ request, name, role, personnelId: personnel?.id || null });
    return noStore({ success: false, error: 'Nama atau peran tidak terdaftar sebagai personel aktif.' }, 401);
  }
  if (!verifyInternalPin(parsed.data.pin, role, Date.now(), pinIdentity)) {
    await recordLoginFailure({ request, name: personnel?.full_name || whitelistedName.full_name, role, personnelId: personnel?.id || null });
    return noStore({ success: false, error: 'PIN akses tidak valid atau sudah kedaluwarsa.' }, 401);
  }

  if (!personnel) {
    try {
      const db = createServiceRoleClient();
      const { error: insertError } = await db.from('rnt_personnel').upsert({
        full_name: whitelistedName.full_name,
        normalized_name: normalizedName,
        role: whitelistedName.role,
        rank: parsed.data.rank,
        position: parsed.data.position,
        department: parsed.data.department,
        is_active: true,
      }, { onConflict: 'normalized_name', ignoreDuplicates: true });
      if (insertError) throw insertError;
      const { data, error } = await db.from('rnt_personnel').select('id,full_name,role,is_active').eq('normalized_name', normalizedName).eq('is_active', true).maybeSingle();
      if (error) throw error;
      personnel = data;
      if (!personnel || personnel.role !== role) {
        await recordLoginFailure({ request, name: whitelistedName.full_name, role, personnelId: personnel?.id || null });
        return noStore({ success: false, error: 'Nama atau peran tidak terdaftar sebagai personel aktif.' }, 401);
      }
    } catch (error) {
      console.error('Whitelisted Staff profile creation failed:', error);
      return noStore({ success: false, error: 'Profil personel tidak dapat disiapkan.' }, 503);
    }
  }

  const rank = parsed.data.rank;
  const position = parsed.data.position;
  const department = parsed.data.department;
  const ipHash = createHmac('sha256', process.env.INTERNAL_SESSION_SECRET || '').update(requestIp(request)).digest('hex');
  try {
    const db = createServiceRoleClient();
    const { error } = await db.from('personnel_audit_logs').insert({
      personnel_id: personnel.id, personnel_name: personnel.full_name, role,
      event: 'LOGIN_SUCCESS', ip_hash: ipHash,
    });
    if (error) throw error;
  } catch (error) {
    console.error('Personnel login audit failed:', error);
    return noStore({ success: false, error: 'Login tidak dapat dicatat. Coba lagi.' }, 503);
  }
  const response = noStore({
    success: true,
    officerName: personnel.full_name,
    userRole: role,
    officerRank: rank,
    officerPosition: position,
    officerDepartment: department,
  });
  response.cookies.set(INTERNAL_SESSION_COOKIE, createInternalSessionToken({
    name: personnel.full_name, role, rank, position, department, personnelId: personnel.id,
  }), sessionCookieOptions());
  return response;
}

export async function DELETE(request) {
  if (!isSameOrigin(request)) return noStore({ success: false, error: 'Asal permintaan tidak valid.' }, 403);
  const response = noStore({ success: true });
  response.cookies.set(INTERNAL_SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
