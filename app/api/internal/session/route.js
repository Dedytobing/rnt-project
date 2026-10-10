import { NextResponse } from 'next/server';
import { hasInternalPinConfig, verifyInternalPin } from '@/lib/internal-pin';
import {
  createInternalSessionToken,
  getInternalSession,
  hasSessionSecret,
  INTERNAL_SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/internal-session';

export async function GET(request) {
  const session = getInternalSession(request);
  return NextResponse.json(session
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
  if (!hasSessionSecret()) {
    return NextResponse.json({ success: false, error: 'Sesi internal belum dikonfigurasi di server.' }, { status: 503 });
  }

  try {
    const { name, role, pin, rank, position, department } = await request.json();
    const cleanName = String(name || '').trim();
    const cleanRank = String(rank || '').trim();
    const cleanPosition = String(position || '').trim();
    const cleanDepartment = String(department || '').trim();
    if (!hasInternalPinConfig()) {
      return NextResponse.json({ success: false, error: 'PIN dinamis belum dikonfigurasi di server. Hubungi administrator.' }, { status: 503 });
    }

    if (
      !['STAFF', 'ADMIN'].includes(role) ||
      cleanName.length < 2 || cleanName.length > 80 ||
      cleanRank.length < 2 || cleanRank.length > 60 ||
      cleanPosition.length > 100 ||
      !['LSPD', 'LSSD'].includes(cleanDepartment)
    ) {
      return NextResponse.json({ success: false, error: 'Nama, pangkat, dan departemen wajib diisi dengan benar. Jabatan/divisi boleh dikosongkan.' }, { status: 400 });
    }

    if (!verifyInternalPin(pin, role)) {
      return NextResponse.json({ success: false, error: `Verifikasi akses ${role === 'ADMIN' ? 'Team RED' : 'staff'} gagal.` }, { status: 401 });
    }

    const response = NextResponse.json({
      success: true,
      officerName: cleanName,
      userRole: role,
      officerRank: cleanRank,
      officerPosition: cleanPosition,
      officerDepartment: cleanDepartment,
    });
    response.cookies.set(INTERNAL_SESSION_COOKIE, createInternalSessionToken({
      name: cleanName,
      role,
      rank: cleanRank,
      position: cleanPosition,
      department: cleanDepartment,
    }), sessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ success: false, error: 'Permintaan login tidak valid.' }, { status: 400 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(INTERNAL_SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
