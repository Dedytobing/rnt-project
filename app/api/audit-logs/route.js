import { NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { getInternalSession } from '@/lib/internal-session';
import { createInternalDataClient } from '@/lib/supabase-server';
import { auditQuerySchema } from '@/lib/validation';

const readableStatus = (value) => ({
  Interview: 'Lolos Review CV',
  Accepted: 'Diterima',
  Rejected: 'Ditolak',
  Pending: 'Pending',
  Passed: 'Lulus',
  Failed: 'Tidak lulus',
  Green: 'Green',
  Yellow: 'Yellow',
  Orange: 'Orange',
  Red: 'Red',
}[value] || value || 'Belum diatur');

function describeCandidateLog(log, candidateName) {
  const subject = candidateName || 'kandidat';
  if (log.role_action === 'REGISTER') return `Mendaftarkan CV kandidat ${subject} ke batch rekrutmen.`;

  let data;
  try {
    data = JSON.parse(log.action_details || '');
  } catch {
    const rawDetails = String(log.action_details || '').trim();
    // Keep readable new entries, but never expose serialized or malformed legacy JSON.
    return rawDetails && !['{', '['].includes(rawDetails[0])
      ? rawDetails
      : `Memperbarui data kandidat ${subject}.`;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return `Memperbarui data kandidat ${subject}.`;

  if (log.role_action === 'SOFT_DELETE' || data.deleted === true) return `Menghapus kandidat ${subject} dari antrean.`;
  if (log.role_action === 'RESTORE') return `Memulihkan kandidat ${subject} ke antrean.`;

  const changes = [];
  if (data.status_cv) changes.push(`status CV ${readableStatus(data.status_cv)}`);
  if (data.mdt_check) changes.push(`hasil MDT ${readableStatus(data.mdt_check)}`);
  if (data.status_interview) changes.push(`status interview ${readableStatus(data.status_interview)}`);
  if (data.department) changes.push(`departemen final ${data.department}`);
  if (data.department_preference) changes.push(`preferensi departemen ${data.department_preference}`);
  const verb = log.role_action === 'INTERVIEW' ? 'Memperbarui hasil interview' : 'Memperbarui data kandidat';
  return changes.length
    ? `${verb} ${subject}: ${changes.join('; ')}.`
    : `${verb} ${subject}.`;
}

function describePersonnelLog(log) {
  if (log.action_details) return log.action_details;
  const roleName = log.role === 'ADMIN' ? 'Admin' : 'Staff';
  if (log.event === 'LOGIN_SUCCESS') return `Login berhasil sebagai ${roleName}.`;
  if (log.event === 'LOGIN_FAILURE') return `Login gagal untuk peran ${roleName}.`;
  return `Aktivitas akses ${roleName} pada portal.`;
}

function withActor(name, details) {
  const actor = String(name || 'Pengguna sistem').trim();
  const sentence = String(details || 'melakukan aktivitas di portal.').trim();
  return `${actor} ${sentence.charAt(0).toLocaleLowerCase('id-ID')}${sentence.slice(1)}`;
}

const equipmentStatusName = (status) => ({ ISSUED: 'diberikan', RETURNED: 'dikembalikan', PENDING: 'belum diberikan' }[status] || status.toLowerCase());

export async function GET(request) {
  try {
    const query = auditQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    if (!query.success) return NextResponse.json({ success: false, error: 'Filter permintaan tidak valid.' }, { status: 400 });
    const session = getInternalSession(request);
    if (session?.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Audit log global hanya dapat diakses Team RED.' },
        { status: 403 }
      );
    }
    const supabase = createInternalDataClient(session);

    const { data: logs, error } = await supabase
      .from('candidate_logs')
      .select('id, candidate_id, officer_name, role_action, action_details, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Audit log query failed:', error);
      return NextResponse.json(
        { success: false, error: 'Audit log gagal dimuat.' },
        { status: 500 }
      );
    }

    const { data: personnelLogs, error: personnelLogError } = await supabase
      .from('personnel_audit_logs')
      .select('id,personnel_name,role,event,target_name,action_details,ip_hash,created_at')
      .order('created_at', { ascending: false });
    if (personnelLogError) {
      console.error('Personnel audit query failed:', personnelLogError);
      return NextResponse.json({ success: false, error: 'Audit login gagal dimuat.' }, { status: 500 });
    }

    const { data: equipmentLogs, error: equipmentLogError } = await supabase
      .from('interview_equipment_logs')
      .select('id,candidate_id,batch_id,item,status,changed_by,created_at')
      .order('created_at', { ascending: false });
    if (equipmentLogError) {
      console.error('Equipment audit query failed:', equipmentLogError);
      return NextResponse.json({ success: false, error: 'Riwayat perlengkapan gagal dimuat.' }, { status: 500 });
    }

    const candidateIds = [...new Set([...(logs || []), ...(equipmentLogs || [])].map((log) => log.candidate_id).filter(Boolean))];
    let candidateNames = new Map();

    if (candidateIds.length) {
      const { data: candidates, error: candidatesError } = await supabase
        .from('candidates')
        .select('id, nama')
        .in('id', candidateIds);

      if (candidatesError) {
        console.error('Audit log candidate lookup failed:', candidatesError);
        return NextResponse.json(
        { success: false, error: 'Data audit log gagal dimuat.' },
          { status: 500 }
        );
      }

      candidateNames = new Map((candidates || []).map((candidate) => [candidate.id, candidate.nama]));
    }

    const enrichedLogs = [
      ...(logs || []).map((log) => ({
        ...log,
        action_details: withActor(log.officer_name, describeCandidateLog(log, candidateNames.get(log.candidate_id))),
        candidates: log.candidate_id ? { nama: candidateNames.get(log.candidate_id) || null } : null,
      })),
      ...(personnelLogs || []).map((log) => ({
        id: `personnel-${log.id}`, candidate_id: null, officer_name: log.personnel_name,
        role_action: log.event, action_details: withActor(log.personnel_name, describePersonnelLog(log)), target_name: log.target_name,
        created_at: log.created_at, candidates: log.target_name ? { nama: log.target_name } : null,
      })),
      ...(equipmentLogs || []).map((log) => ({
        id: `equipment-${log.id}`, candidate_id: log.candidate_id, officer_name: log.changed_by,
        role_action: 'EQUIPMENT_UPDATE',
        action_details: withActor(log.changed_by, `Mencatat perlengkapan ${log.item === 'KEY' ? 'kunci' : 'lencana'} untuk ${candidateNames.get(log.candidate_id) || 'kandidat'}: ${equipmentStatusName(log.status)}.`),
        created_at: log.created_at, candidates: { nama: candidateNames.get(log.candidate_id) || null },
      })),
    ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

      return NextResponse.json({ success: true, logs: enrichedLogs }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    // Next uses internal exceptions to defer request-dependent work during prerendering.
    // Let those control-flow signals pass through instead of treating them as API failures.
    unstable_rethrow(error);
    console.error('Audit log request failed:', error);
    return NextResponse.json(
      { success: false, error: 'Audit log gagal dimuat.' },
      { status: 500 }
    );
  }
}
