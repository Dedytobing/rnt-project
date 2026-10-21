import { NextResponse } from 'next/server';
import { getInternalSession } from '@/lib/internal-session';
import { createInternalDataClient } from '@/lib/supabase-server';
import { checkCandidateStageWindow } from '@/lib/stage-access';
import { z } from 'zod';

const querySchema = z.object({ candidate_id: z.string().min(1).max(100) }).strict();

function statusLabel(cvStatus, interviewStatus) {
  if (interviewStatus === 'Passed') return 'Lulus interview';
  if (interviewStatus === 'Failed') return 'Tidak lulus interview';
  if (interviewStatus === 'Pending') return 'Interview menunggu hasil';
  if (cvStatus === 'Accepted' || cvStatus === 'Interview') return 'CV diterima';
  if (cvStatus === 'Rejected') return 'CV ditolak';
  if (cvStatus === 'Pending') return 'Perlu perbaikan';
  return 'Belum direview';
}

export async function GET(request) {
  const session = getInternalSession(request);
  if (!session) return NextResponse.json({ success: false, error: 'Sesi personel diperlukan.' }, { status: 401 });

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Kandidat tidak valid.' }, { status: 400 });

  try {
    const db = createInternalDataClient(session);
    const { data: current, error: currentError } = await db.from('candidates')
      .select('id,batch_id,nama,link_cv').eq('id', parsed.data.candidate_id).is('deleted_at', null).maybeSingle();
    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ success: false, error: 'Kandidat tidak ditemukan.' }, { status: 404 });

    const access = await checkCandidateStageWindow(db, current.id, 'review');
    if (!access.allowed) return NextResponse.json({ success: false, error: access.message }, { status: access.status });

    const exactNamePattern = String(current.nama || '').replace(/[\\%_]/g, '\\$&');
    const historyQueries = [
      db.from('candidates').select('id,nama,batch_id,status_cv,status_interview,created_at,deleted_at')
        .ilike('nama', exactNamePattern).neq('id', current.id).limit(100),
    ];
    if (current.link_cv) {
      historyQueries.push(db.from('candidates').select('id,nama,batch_id,status_cv,status_interview,created_at,deleted_at')
        .eq('link_cv', current.link_cv).neq('id', current.id).limit(100));
    }
    const historyResults = await Promise.all(historyQueries);
    const queryError = historyResults.find((result) => result.error)?.error;
    if (queryError) throw queryError;

    const applicationsById = new Map();
    for (const result of historyResults) {
      for (const application of result.data || []) {
        if (application.batch_id && application.batch_id !== current.batch_id) applicationsById.set(application.id, application);
      }
    }
    const latestApplicationByBatch = new Map();
    for (const application of applicationsById.values()) {
      const previous = latestApplicationByBatch.get(application.batch_id);
      if (!previous || Date.parse(application.created_at || '') > Date.parse(previous.created_at || '')) {
        latestApplicationByBatch.set(application.batch_id, application);
      }
    }
    const applications = [...latestApplicationByBatch.values()];
    const batchIds = [...new Set(applications.map((application) => application.batch_id))];
    if (!batchIds.length) {
      return NextResponse.json({ success: true, history: [] }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
    }

    const { data: batches, error: batchError } = await db.from('recruitment_batches')
      .select('id,name,registration_start').in('id', batchIds);
    if (batchError) throw batchError;
    const batchById = new Map((batches || []).map((batch) => [batch.id, batch]));
    const history = applications.map((application) => {
      const batch = batchById.get(application.batch_id);
      return {
        id: application.id,
        batchId: application.batch_id,
        batchName: batch?.name || 'Batch sebelumnya',
        batchStart: batch?.registration_start || null,
        createdAt: application.created_at,
        statusCv: application.status_cv || '',
        statusInterview: application.status_interview || '',
        lastStatus: statusLabel(application.status_cv, application.status_interview),
        deleted: Boolean(application.deleted_at),
      };
    }).sort((left, right) => Date.parse(right.createdAt || '') - Date.parse(left.createdAt || ''));

    return NextResponse.json({ success: true, history }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    console.error('Candidate application history query failed:', error);
    return NextResponse.json({ success: false, error: 'Riwayat lamaran kandidat gagal dimuat.' }, { status: 503 });
  }
}
