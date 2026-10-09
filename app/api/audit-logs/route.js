import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getInternalSession } from '@/lib/internal-session';

export async function GET(request) {
  if (getInternalSession(request)?.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Audit log global hanya dapat diakses Team RED.' },
      { status: 403 }
    );
  }

  try {
    const { data: logs, error } = await supabase
      .from('candidate_logs')
      .select('id, candidate_id, officer_name, role_action, action_details, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Audit log query failed:', error);
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: 500 }
      );
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
          { success: false, error: candidatesError.message, code: candidatesError.code },
          { status: 500 }
        );
      }

      candidateNames = new Map((candidates || []).map((candidate) => [candidate.id, candidate.nama]));
    }

    const enrichedLogs = (logs || []).map((log) => ({
      ...log,
      candidates: log.candidate_id ? { nama: candidateNames.get(log.candidate_id) || null } : null,
    }));

    return NextResponse.json({ success: true, logs: enrichedLogs });
  } catch (error) {
    console.error('Audit log request failed:', error);
    return NextResponse.json(
      { success: false, error: 'Audit log gagal dimuat.' },
      { status: 500 }
    );
  }
}
