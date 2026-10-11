import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getInternalSession } from '@/lib/internal-session';
import { createInternalDataClient } from '@/lib/supabase-server';

const candidateAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('SOFT_DELETE'), candidateId: z.string().min(1).max(100), batchId: z.uuid() }).strict(),
  z.object({ action: z.literal('RESTORE'), candidateId: z.string().min(1).max(100), batchId: z.uuid() }).strict(),
]);
const groupAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('SAVE_PIC_GROUP'), groupId: z.uuid().nullable(), batchId: z.uuid(), name: z.string().trim().min(2).max(100), personnelIds: z.array(z.uuid()).max(100) }).strict(),
  z.object({ action: z.literal('DELETE_PIC_GROUP'), groupId: z.uuid(), batchId: z.uuid() }).strict(),
  z.object({ action: z.literal('SET_CANDIDATE_GROUP'), candidateId: z.string().min(1).max(100), batchId: z.uuid(), groupId: z.uuid().nullable() }).strict(),
  z.object({ action: z.literal('SET_CANDIDATE_GROUPS_BULK'), candidateIds: z.array(z.string().min(1).max(100)).min(1).max(500), batchId: z.uuid(), groupId: z.uuid() }).strict(),
]);

export async function GET(request) {
  const session = getInternalSession(request);
  if (!session) return NextResponse.json({ success: false, error: 'Sesi personel diperlukan.' }, { status: 401 });
  if (session.role !== 'ADMIN') return NextResponse.json({ success: false, error: 'Akses Admin RNT diperlukan.' }, { status: 403 });
  try {
    const db = createInternalDataClient(session);
    const batchId = z.uuid().safeParse(new URL(request.url).searchParams.get('batch_id'));
    if (!batchId.success) return NextResponse.json({ success: false, error: 'Pilih batch untuk memuat data manajemen.' }, { status: 400 });
    const { data: batch, error: batchError } = await db.from('recruitment_batches')
      .select('id,name,is_active,registration_start,registration_end,review_start,review_end,interview_start,interview_end,academy_start,academy_end')
      .eq('id', batchId.data).is('deleted_at', null).maybeSingle();
    if (batchError) throw batchError;
    if (!batch) return NextResponse.json({ success: false, error: 'Batch tidak ditemukan atau sudah dihapus.' }, { status: 404 });
    const [personnel, candidates, attendance, groups, groupMembers, candidateGroups] = await Promise.all([
      db.from('rnt_personnel').select('id,full_name,role,rank,position,department,is_active').order('full_name'),
      db.from('candidates').select('id,nama,batch_id,deleted_at,deleted_by,status_cv,status_interview,created_at').eq('batch_id', batchId.data).order('created_at', { ascending: false }),
      db.from('academy_attendance').select('*').eq('batch_id', batchId.data).order('updated_at', { ascending: false }),
      db.from('academy_pic_groups').select('id,batch_id,name,created_by,created_at,updated_at').eq('batch_id', batchId.data).order('created_at'),
      db.from('academy_pic_group_members').select('group_id,batch_id,personnel_id,assigned_by,created_at').eq('batch_id', batchId.data),
      db.from('academy_candidate_pic_groups').select('candidate_id,batch_id,group_id,assigned_by,assigned_at').eq('batch_id', batchId.data),
    ]);
    const failed = [personnel, candidates, attendance, groups, groupMembers, candidateGroups].find((result) => result.error);
    if (failed) throw failed.error;
    return NextResponse.json({
      success: true,
      batch,
      personnel: personnel.data || [],
      candidates: candidates.data || [],
      attendance: attendance.data || [],
      groups: groups.data || [],
      groupMembers: groupMembers.data || [],
      candidateGroups: candidateGroups.data || [],
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Internal management data query failed:', error);
    return NextResponse.json({ success: false, error: 'Data manajemen belum dapat dimuat. Pastikan migrasi database sudah diterapkan.' }, { status: 503 });
  }
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ success: false, error: 'Asal permintaan tidak valid.' }, { status: 403 });
  const session = getInternalSession(request);
  if (!session) return NextResponse.json({ success: false, error: 'Sesi personel diperlukan.' }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: 'Format permintaan tidak valid.' }, { status: 400 }); }
  if (session.role !== 'ADMIN') return NextResponse.json({ success: false, error: 'Aksi ini hanya dapat dilakukan Admin RNT.' }, { status: 403 });
  const parsed = [candidateAction, groupAction].map((schema) => schema.safeParse(body)).find((result) => result.success);
  if (!parsed) return NextResponse.json({ success: false, error: 'Format atau nilai permintaan tidak valid.' }, { status: 400 });
  const action = parsed.data;
  const db = createInternalDataClient(session);
  try {
    if (action.action === 'SOFT_DELETE' || action.action === 'RESTORE') {
      const deleted = action.action === 'SOFT_DELETE';
      let query = db.from('candidates').update({
        deleted_at: deleted ? new Date().toISOString() : null,
        deleted_by: deleted ? session.name : null,
        updated_at: new Date().toISOString(),
      }).eq('id', action.candidateId).eq('batch_id', action.batchId);
      query = deleted ? query.is('deleted_at', null) : query.not('deleted_at', 'is', null);
      const { data, error } = await query.select('id').maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ success: false, error: 'Kandidat tidak ditemukan dalam batch terpilih.' }, { status: 404 });
      return NextResponse.json({ success: true });
    }

    if (action.action === 'SAVE_PIC_GROUP') {
      const { data, error } = await db.rpc('save_academy_pic_group', {
        p_group_id: action.groupId,
        p_batch_id: action.batchId,
        p_name: action.name,
        p_personnel_ids: [...new Set(action.personnelIds)],
        p_actor: session.name,
      });
      if (error) {
        if (error.message?.includes('Every PIC must be active personnel')) return NextResponse.json({ success: false, error: 'Semua PIC harus personel aktif.' }, { status: 400 });
        if (error.message?.includes('must retain at least one PIC')) return NextResponse.json({ success: false, error: 'Kelompok yang sudah memiliki kandidat harus tetap memiliki minimal satu PIC.' }, { status: 409 });
        if (error.message?.includes('Batch is not active')) return NextResponse.json({ success: false, error: 'Batch tidak ditemukan atau sudah dihapus.' }, { status: 404 });
        if (error.code === '23505') return NextResponse.json({ success: false, error: 'Nama kelompok sudah digunakan pada batch ini.' }, { status: 409 });
        throw error;
      }
      return NextResponse.json({ success: true, groupId: data });
    }

    if (action.action === 'DELETE_PIC_GROUP') {
      const { error } = await db.rpc('delete_academy_pic_group', {
        p_group_id: action.groupId,
        p_batch_id: action.batchId,
        p_actor: session.name,
      });
      if (error) {
        if (error.message?.includes('PIC group was not found')) return NextResponse.json({ success: false, error: 'Kelompok tidak ditemukan pada batch ini.' }, { status: 404 });
        throw error;
      }
      return NextResponse.json({ success: true });
    }

    if (action.action === 'SET_CANDIDATE_GROUP') {
      const { error } = await db.rpc('set_academy_candidate_pic_group', {
        p_candidate_id: action.candidateId,
        p_batch_id: action.batchId,
        p_group_id: action.groupId,
        p_actor: session.name,
      });
      if (error) {
        if (error.message?.includes('Candidate is not active')) return NextResponse.json({ success: false, error: 'Kandidat tidak ditemukan pada batch ini.' }, { status: 404 });
        if (error.message?.includes('PIC group was not found')) return NextResponse.json({ success: false, error: 'Kelompok tidak ditemukan pada batch ini.' }, { status: 404 });
        if (error.message?.includes('must have at least one member')) return NextResponse.json({ success: false, error: 'Pilih anggota kelompok sebelum memasukkan kandidat.' }, { status: 409 });
        throw error;
      }
      return NextResponse.json({ success: true });
    }

    if (action.action === 'SET_CANDIDATE_GROUPS_BULK') {
      const { data, error } = await db.rpc('set_academy_candidate_pic_groups_bulk', {
        p_candidate_ids: [...new Set(action.candidateIds)],
        p_batch_id: action.batchId,
        p_group_id: action.groupId,
        p_actor: session.name,
      });
      if (error) {
        if (error.message?.includes('PIC group was not found')) return NextResponse.json({ success: false, error: 'Kelompok tidak ditemukan pada batch ini.' }, { status: 404 });
        if (error.message?.includes('must have at least one member')) return NextResponse.json({ success: false, error: 'Kelompok tujuan harus memiliki minimal satu anggota PIC.' }, { status: 409 });
        if (error.message?.includes('not active in the selected batch')) return NextResponse.json({ success: false, error: 'Sebagian kandidat tidak aktif pada batch ini.' }, { status: 404 });
        if (error.message?.includes('between 1 and 500')) return NextResponse.json({ success: false, error: 'Pilih maksimal 500 kandidat sekaligus.' }, { status: 400 });
        throw error;
      }
      return NextResponse.json({ success: true, updatedCount: data });
    }
  } catch (error) {
    console.error('Internal management action failed:', error);
    return NextResponse.json({ success: false, error: 'Perubahan belum dapat disimpan. Pastikan migrasi database sudah diterapkan.' }, { status: 500 });
  }
  return NextResponse.json({ success: false, error: 'Aksi tidak dikenali.' }, { status: 400 });
}
