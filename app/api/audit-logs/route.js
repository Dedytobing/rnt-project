import { NextResponse } from 'next/server';
import { getInternalSession } from '@/lib/internal-session';
import { createInternalDataClient } from '@/lib/supabase-server';
import { auditQuerySchema } from '@/lib/validation';

export async function GET(request) {
  try {
    const query = auditQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
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
      .select('id,personnel_name,role,event,ip_hash,created_at')
      .order('created_at', { ascending: false });
    if (personnelLogError) {
      console.error('Personnel audit query failed:', personnelLogError);
      return NextResponse.json({ success: false, error: 'Audit login gagal dimuat.' }, { status: 500 });
    }

    const candidateIds = [...new Set((logs || []).map((log) => log.candidate_id).filter(Boolean))];
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
      candidates: log.candidate_id ? { nama: candidateNames.get(log.candidate_id) || null } : null,
      })),
      ...(personnelLogs || []).map((log) => ({
        id: `personnel-${log.id}`, candidate_id: null, officer_name: log.personnel_name,
        role_action: log.event, action_details: `Role: ${log.role}${log.ip_hash ? ` · IP hash: ${log.ip_hash.slice(0, 12)}` : ''}`,
        created_at: log.created_at, candidates: null,
      })),
    ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

      return NextResponse.json({ success: true, logs: enrichedLogs }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Audit log request failed:', error);
    return NextResponse.json(
      { success: false, error: 'Audit log gagal dimuat.' },
      { status: 500 }
    );
  }
}
