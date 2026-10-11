import { NextResponse } from 'next/server';
import { getInternalSession } from '@/lib/internal-session';
import { createInternalDataClient } from '@/lib/supabase-server';
import { checkCandidateStageWindow } from '@/lib/stage-access';
import { z } from 'zod';

export async function GET(request) {
  const session = getInternalSession(request);
  if (!session) return NextResponse.json({ success:false,error:'Sesi personel diperlukan.' },{status:401});
  const batchId = new URL(request.url).searchParams.get('batch_id');
  if (!batchId) return NextResponse.json({ success:false,error:'Batch belum dipilih.' },{status:400});
  const db = createInternalDataClient(session);
  const { data: batch, error } = await db.from('recruitment_batches').select('id,name,academy_start,academy_end').eq('id', batchId).is('deleted_at', null).maybeSingle();
  if (error) return NextResponse.json({ success:false,error:'Jadwal Academy gagal dimuat.' },{status:503});
  const now = Date.now();
  if (!batch) return NextResponse.json({ success:false,error:'Batch tidak ditemukan.' },{status:404});
  const academyOpen = now >= Date.parse(batch.academy_start) && now <= Date.parse(batch.academy_end);
  if (session.role === 'STAFF' && !academyOpen) return NextResponse.json({ success:false,error:'Akses Academy hanya tersedia selama jadwal batch berlangsung.' },{status:403});
  const [candidateResult, attendanceResult, personnelResult, groupResult, memberResult, candidateGroupResult] = await Promise.all([
    db.from('candidates').select('id,nama,batch_id').eq('batch_id', batchId).is('deleted_at', null).order('nama'),
    db.from('academy_attendance').select('*').eq('batch_id', batchId),
    db.from('rnt_personnel').select('id,full_name').eq('is_active', true).order('full_name'),
    db.from('academy_pic_groups').select('id,batch_id,name').eq('batch_id', batchId),
    db.from('academy_pic_group_members').select('group_id,batch_id,personnel_id').eq('batch_id', batchId),
    db.from('academy_candidate_pic_groups').select('candidate_id,batch_id,group_id').eq('batch_id', batchId),
  ]);
  const failure = [candidateResult, attendanceResult, personnelResult, groupResult, memberResult, candidateGroupResult].find((result) => result.error);
  if (failure) return NextResponse.json({ success:false,error:'Daftar absensi Academy gagal dimuat.' },{status:503});
  return NextResponse.json({ success:true,batches:[batch],candidates:candidateResult.data || [],attendance:attendanceResult.data || [],personnel:personnelResult.data || [],groups:groupResult.data || [],groupMembers:memberResult.data || [],candidateGroups:candidateGroupResult.data || [],role:session.role,personnelId:session.personnelId },{headers:{'Cache-Control':'private, no-store, max-age=0'}});
}

export async function POST(request) {
  const session = getInternalSession(request);
  if (!session) return NextResponse.json({ success:false,error:'Sesi personel diperlukan.' },{status:401});
  if (!['STAFF', 'ADMIN'].includes(session.role)) return NextResponse.json({ success:false,error:'Sesi staff atau admin diperlukan.' },{status:403});
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ success:false,error:'Asal permintaan tidak valid.' },{status:403});
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({success:false,error:'Permintaan tidak valid.'},{status:400}); }
  const validBody = z.object({ candidateId: z.string().min(1).max(100), batchId: z.uuid(), status: z.enum(['PENDING','PRESENT','ABSENT','EXCUSED']) }).strict().safeParse(body);
  if (!validBody.success) return NextResponse.json({success:false,error:'Data absensi tidak valid.'},{status:400});
  const { candidateId, batchId, status } = validBody.data;
  const db = createInternalDataClient(session);
  const { data: candidate, error: candidateError } = await db.from('candidates').select('batch_id').eq('id', candidateId).is('deleted_at', null).maybeSingle();
  if (candidateError) return NextResponse.json({success:false,error:'Kandidat gagal diverifikasi.'},{status:503});
  if (!candidate || candidate.batch_id !== batchId) return NextResponse.json({success:false,error:'Kandidat tidak ditemukan pada batch ini.'},{status:404});
  if (session.role === 'STAFF') {
    const access = await checkCandidateStageWindow(db, candidateId, 'academy');
    if (!access.allowed) return NextResponse.json({success:false,error:access.message},{status:access.status});
  }
  const { data: candidateGroup, error: assignmentError } = await db.from('academy_candidate_pic_groups').select('group_id').eq('candidate_id', String(candidateId)).eq('batch_id', batchId).maybeSingle();
  if (assignmentError) return NextResponse.json({success:false,error:'Kelompok PIC gagal diverifikasi.'},{status:503});
  if (!candidateGroup) return NextResponse.json({success:false,error:'Kandidat belum dimasukkan ke kelompok PIC.'},{status:403});
  const { data: membership, error: membershipError } = await db.from('academy_pic_group_members').select('personnel_id').eq('group_id', candidateGroup.group_id).eq('batch_id', batchId).eq('personnel_id', session.personnelId).maybeSingle();
  if (membershipError) return NextResponse.json({success:false,error:'Keanggotaan PIC gagal diverifikasi.'},{status:503});
  if (!membership) return NextResponse.json({success:false,error:'Hanya personel dalam kelompok PIC kandidat yang dapat mencatat kehadiran.'},{status:403});
  const { error } = await db.from('academy_attendance').update({ attendance_status:status, updated_by:session.name, updated_at:new Date().toISOString() }).eq('candidate_id',String(candidateId)).eq('batch_id',batchId);
  if (error) return NextResponse.json({success:false,error:'Absensi gagal disimpan.'},{status:500});
  return NextResponse.json({success:true});
}
