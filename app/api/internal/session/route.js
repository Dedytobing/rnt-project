import { NextResponse } from 'next/server';
import { hasInternalPinConfig, verifyInternalPin } from '@/lib/internal-pin';
import {
  browserSessionCookieOptions,
  createInternalSessionToken,
  createRememberedPinToken,
  getInternalSession,
  hasSessionSecret,
  INTERNAL_SESSION_COOKIE,
  readRememberedPinToken,
  REMEMBERED_PIN_COOKIE,
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
    await db.from('personnel_audit_logs').insert({
      personnel_id: personnelId,
      personnel_name: name,
      role,
      event: 'LOGIN_FAILURE',
      action_details: `Login gagal untuk peran ${role === 'ADMIN' ? 'Admin' : 'Staff'}.`,
      ip_hash: ipHash,
    });
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
  const currentSession = getInternalSession(request);
  const remembered = readRememberedPinToken(request);
  let profile = currentSession || null;
  let expiresAt = currentSession?.expiresAt || remembered?.expiresAt;
  try {
    if (!profile && remembered) {
      const db = createServiceRoleClient();
      const { data: personnel, error: personnelError } = await db.from('rnt_personnel')
        .select('id,full_name,normalized_name,role,rank,position,department,is_active')
        .eq('id', remembered.personnelId).eq('is_active', true).maybeSingle();
      if (personnelError) throw personnelError;
      let access = null;
      if (personnel && personnel.role === remembered.role) {
        const { data, error } = await db.from('rnt_personnel_name_whitelist')
          .select('id').eq('normalized_name', personnel.normalized_name)
          .eq('role', remembered.role).eq('is_active', true).maybeSingle();
        if (error) throw error;
        access = data;
      }
      if (access && personnel?.rank && ['LSPD', 'LSSD'].includes(personnel.department)) {
        profile = {
          name: personnel.full_name,
          role: personnel.role,
          rank: personnel.rank,
          position: personnel.position || '',
          department: personnel.department,
          personnelId: personnel.id,
        };
      }
    }
    const pinVerified = Boolean(profile && expiresAt > Math.floor(Date.now() / 1000));
    const response = noStore(pinVerified ? {
      authenticated: false,
      pinVerified: true,
      officerName: profile.name,
      userRole: profile.role,
      officerRank: profile.rank,
      officerPosition: profile.position || '',
      officerDepartment: profile.department,
      expiresAt,
    } : { authenticated: false, pinVerified: false });
    // A page reload always returns to the lock screen; only the explicit login action creates a portal session.
    response.cookies.set(INTERNAL_SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
    if (pinVerified && (!remembered || remembered.personnelId !== profile.personnelId || remembered.role !== profile.role)) {
      response.cookies.set(REMEMBERED_PIN_COOKIE, createRememberedPinToken({
        personnelId: profile.personnelId,
        role: profile.role,
        expiresAt,
      }), sessionCookieOptions(expiresAt - Math.floor(Date.now() / 1000)));
    } else if (!pinVerified && request.cookies?.get(REMEMBERED_PIN_COOKIE)?.value) {
      response.cookies.set(REMEMBERED_PIN_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
    }
    return response;
  } catch (error) {
    console.error('Remembered personnel profile verification failed:', error);
    return noStore({ authenticated: false, pinVerified: false, error: 'Sesi tersimpan belum dapat diverifikasi.' }, 503);
  }
}

export async function POST(request) {
  if (!isSameOrigin(request)) return noStore({ success: false, error: 'Asal permintaan tidak valid.' }, 403);

  const limited = await enforceRateLimit(request, {
    namespace: 'personnel-pin-login',
    limit: 18,
    windowSeconds: 2 * 60,
  });
  const rateLimitError = rateLimitResponse(limited);
  if (rateLimitError) return rateLimitError;

  const parsed = await readValidatedJson(request, pinSessionSchema, 2048);
  if (!parsed.data) return noStore({ success: false, error: parsed.error }, parsed.status);

  const profileLimited = await enforceRateLimit(request, {
    namespace: 'personnel-pin-login-role',
    identifier: parsed.data.role,
    limit: 18,
    windowSeconds: 2 * 60,
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
    const lookupStartedAt = performance.now();
    const [whitelistResult, personnelResult] = await Promise.all([
      db.from('rnt_personnel_name_whitelist').select('full_name,normalized_name,role').eq('normalized_name', normalizedName).eq('is_active', true).maybeSingle(),
      db.from('rnt_personnel').select('id,full_name,normalized_name,role,rank,position,department,is_active').eq('normalized_name', normalizedName).eq('is_active', true).maybeSingle(),
    ]);
    const lookupLatencyMs = Math.round(performance.now() - lookupStartedAt);
    if (lookupLatencyMs > 500) {
      console.warn('Personnel login database lookup latency is high:', { latencyMs: lookupLatencyMs });
    }
    if (whitelistResult.error) throw whitelistResult.error;
    if (personnelResult.error) throw personnelResult.error;
    whitelistedName = whitelistResult.data;
    personnel = personnelResult.data;
  } catch (error) {
    console.error('Personnel whitelist lookup failed:', error);
    return noStore({ success: false, error: 'Daftar verifikasi personel belum tersedia.' }, 503);
  }
  if (!whitelistedName) {
    await recordLoginFailure({ request, name, role, personnelId: personnel?.id || null });
    return noStore({ success: false, error: 'Nama atau peran tidak terdaftar sebagai personel aktif.' }, 401);
  }
  if (whitelistedName.role !== role) {
    await recordLoginFailure({ request, name: whitelistedName.full_name, role, personnelId: personnel?.id || null });
    return noStore({
      success: false,
      code: 'ROLE_MISMATCH',
      name: whitelistedName.full_name,
      registeredRole: whitelistedName.role,
      error: `Akses Peran Tidak Sesuai: Nama ${whitelistedName.full_name} terdaftar sebagai ${whitelistedName.role}. Silakan sesuaikan pilihan Peran Sesi Anda.`,
    }, 401);
  }
  if (personnel && personnel.role !== role) {
    await recordLoginFailure({ request, name: personnel.full_name, role, personnelId: personnel.id });
    return noStore({ success: false, error: 'Profil personel tidak sesuai dengan whitelist. Hubungi Admin RNT.' }, 401);
  }
  const rememberedPin = readRememberedPinToken(request);
  const resumesVerifiedSession = Boolean(!parsed.data.pin && rememberedPin
    && personnel?.id === rememberedPin.personnelId
    && role === rememberedPin.role);
  if (!resumesVerifiedSession && !verifyInternalPin(parsed.data.pin, role, Date.now(), pinIdentity)) {
    await recordLoginFailure({ request, name: personnel?.full_name || whitelistedName.full_name, role, personnelId: personnel?.id || null });
    return noStore({ success: false, error: 'PIN akses tidak valid atau sudah kedaluwarsa.' }, 401);
  }

  let personnelCreated = false;
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
      personnelCreated = true;
    } catch (error) {
      console.error('Whitelisted Staff profile creation failed:', error);
      return noStore({ success: false, error: 'Profil personel tidak dapat disiapkan.' }, 503);
    }
  }

  const rank = resumesVerifiedSession ? personnel.rank : parsed.data.rank;
  const position = resumesVerifiedSession ? personnel.position || '' : parsed.data.position;
  const department = resumesVerifiedSession ? personnel.department : parsed.data.department;
  const ipHash = createHmac('sha256', process.env.INTERNAL_SESSION_SECRET || '').update(requestIp(request)).digest('hex');
  try {
    const db = createServiceRoleClient();
    if (personnelCreated) {
      const { error: profileAuditError } = await db.from('personnel_audit_logs').insert({
        personnel_id: personnel.id,
        personnel_name: personnel.full_name,
        role,
        event: 'PERSONNEL_ADDED',
        target_name: personnel.full_name,
        action_details: `Membuat profil personel ${personnel.full_name} pada login pertama dengan akses ${role === 'ADMIN' ? 'Admin' : 'Staff'}.`,
      });
      if (profileAuditError) throw profileAuditError;
    }
    const { error } = await db.from('personnel_audit_logs').insert({
      personnel_id: personnel.id, personnel_name: personnel.full_name, role,
      event: resumesVerifiedSession ? 'SESSION_RESUMED' : 'LOGIN_SUCCESS',
      action_details: resumesVerifiedSession
        ? 'Melanjutkan sesi dengan verifikasi PIN 24 jam yang masih aktif.'
        : `Login berhasil sebagai ${role === 'ADMIN' ? 'Admin' : 'Staff'}.`,
      ip_hash: ipHash,
    });
    if (error) throw error;
  } catch (error) {
    console.error('Personnel login audit failed:', error);
    return noStore({ success: false, error: 'Login tidak dapat dicatat. Coba lagi.' }, 503);
  }
  const expiresAt = resumesVerifiedSession ? rememberedPin.expiresAt : Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  const response = noStore({
    success: true,
    officerName: personnel.full_name,
    userRole: role,
    officerRank: rank,
    officerPosition: position,
    officerDepartment: department,
  });
  response.cookies.set(INTERNAL_SESSION_COOKIE, createInternalSessionToken({
    name: personnel.full_name, role, rank, position, department, personnelId: personnel.id, expiresAt,
  }), browserSessionCookieOptions());
  response.cookies.set(REMEMBERED_PIN_COOKIE, createRememberedPinToken({
    personnelId: personnel.id,
    role,
    expiresAt,
  }), sessionCookieOptions(expiresAt - Math.floor(Date.now() / 1000)));
  return response;
}

export async function DELETE(request) {
  if (!isSameOrigin(request)) return noStore({ success: false, error: 'Asal permintaan tidak valid.' }, 403);
  const session = getInternalSession(request);
  if (session) {
    try {
      const db = createServiceRoleClient();
      const { error } = await db.from('personnel_audit_logs').insert({
        personnel_id: session.personnelId,
        personnel_name: session.name,
        role: session.role,
        event: 'LOGOUT',
        action_details: 'Logout dari portal.',
      });
      if (error) console.error('Personnel logout audit failed:', error);
    } catch (error) {
      console.error('Personnel logout audit failed:', error);
    }
  }
  const response = noStore({ success: true });
  response.cookies.set(INTERNAL_SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
