import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getInternalSession } from '@/lib/internal-session';
import { createInternalDataClient } from '@/lib/supabase-server';
import { checkCandidateStageWindow } from '@/lib/stage-access';

const uuidSchema = z.string().uuid();
const updateSchema = z.object({
  candidateId: z.string().min(1).max(100),
  batchId: z.string().uuid(),
  item: z.enum(['KEY', 'BADGE', 'KIT']),
  status: z.enum(['PENDING', 'ISSUED', 'RETURNED']),
}).strict().refine((value) => value.item !== 'KIT' || value.status !== 'RETURNED');

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function GET(request) {
  const session = getInternalSession(request);
  if (!session) return json({ success: false, error: 'Sesi personel diperlukan.' }, 401);
  const batchId = uuidSchema.safeParse(new URL(request.url).searchParams.get('batch_id'));
  if (!batchId.success) return json({ success: false, error: 'Batch tidak valid.' }, 400);
  try {
    const db = createInternalDataClient(session);
    const statusResult = await db.from('interview_equipment_status').select('candidate_id,batch_id,key_status,badge_status,updated_by,updated_at').eq('batch_id', batchId.data);
    if (statusResult.error) throw statusResult.error;
    let statuses = statusResult.data || [];
    if (session.role === 'STAFF') {
      const [{ data: candidates, error: candidatesError }, { data: person, error: personError }] = await Promise.all([
        db.from('candidates').select('id,mapping_dept,dept_preference').eq('batch_id', batchId.data).is('deleted_at', null),
        db.from('rnt_personnel').select('department').eq('id', session.personnelId).eq('is_active', true).maybeSingle(),
      ]);
      if (candidatesError || personError) throw candidatesError || personError;
      const allowedIds = new Set((candidates || []).filter((candidate) => {
        return Boolean(person?.department) && candidate.mapping_dept === person.department;
      }).map((candidate) => String(candidate.id)));
      statuses = statuses.filter((row) => allowedIds.has(String(row.candidate_id)));
    }
    return json({ success: true, statuses });
  } catch (error) {
    console.error('Interview equipment status query failed:', error);
    return json({ success: false, error: 'Status pembagian kunci dan lencana gagal dimuat. Pastikan migrasi database sudah diterapkan.' }, 503);
  }
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ success: false, error: 'Asal permintaan tidak valid.' }, 403);
  const session = getInternalSession(request);
  if (!session) return json({ success: false, error: 'Sesi personel diperlukan.' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ success: false, error: 'Format permintaan tidak valid.' }, 400); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return json({ success: false, error: 'Data pembagian tidak valid.' }, 400);
  const { candidateId, batchId, item, status } = parsed.data;
  try {
    const db = createInternalDataClient(session);
    const access = await checkCandidateStageWindow(db, candidateId, 'academy');
    if (!access.allowed) return json({ success: false, error: access.message }, access.status);
    if (session.role === 'STAFF') {
      const [{ data: candidate, error: candidateError }, { data: person, error: personError }] = await Promise.all([
        db.from('candidates').select('mapping_dept,dept_preference').eq('id', candidateId).eq('batch_id', batchId).is('deleted_at', null).maybeSingle(),
        db.from('rnt_personnel').select('department').eq('id', session.personnelId).eq('is_active', true).maybeSingle(),
      ]);
      if (candidateError || personError) return json({ success: false, error: 'Departemen akses gagal diverifikasi.' }, 503);
      const department = candidate?.mapping_dept;
      if (!candidate || !person?.department || person.department !== department) return json({ success: false, error: 'Pembagian perlengkapan hanya dapat dikelola oleh personel departemen kandidat.' }, 403);
    }
    const { error } = await db.rpc('update_interview_equipment', {
      p_candidate_id: candidateId,
      p_batch_id: batchId,
      p_item: item,
      p_status: status,
      p_actor: session.name,
    });
    if (error) throw error;
    return json({ success: true, message: 'Status perlengkapan berhasil dicatat.' });
  } catch (error) {
    console.error('Interview equipment update failed:', error);
    return json({ success: false, error: 'Status perlengkapan gagal disimpan.' }, 503);
  }
}
