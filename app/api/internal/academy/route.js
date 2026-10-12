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
  const [candidateResult, attendanceResult, personnelResult] = await Promise.all([
    db.from('candidates').select('id,nama,batch_id,mapping_dept,dept_preference').eq('batch_id', batchId).is('deleted_at', null).order('nama'),
    db.from('academy_attendance').select('*').eq('batch_id', batchId),
    db.from('rnt_personnel').select('id,full_name,department').eq('is_active', true).order('full_name'),
  ]);
  const failure = [candidateResult, attendanceResult, personnelResult].find((result) => result.error);
  if (failure) return NextResponse.json({ success:false,error:'Daftar absensi Academy gagal dimuat.' },{status:503});
  const personnel = personnelResult.data || [];
  return NextResponse.json({ success:true,batches:[batch],candidates:candidateResult.data || [],attendance:attendanceResult.data || [],personnel,department:personnel.find((person) => person.id === session.personnelId)?.department || '',role:session.role,personnelId:session.personnelId },{headers:{'Cache-Control':'private, no-store, max-age=0'}});
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
  const { data: candidate, error: candidateError } = await db.from('candidates').select('nama,batch_id,mapping_dept,dept_preference').eq('id', candidateId).is('deleted_at', null).maybeSingle();
  if (candidateError) return NextResponse.json({success:false,error:'Kandidat gagal diverifikasi.'},{status:503});
  if (!candidate || candidate.batch_id !== batchId) return NextResponse.json({success:false,error:'Kandidat tidak ditemukan pada batch ini.'},{status:404});
  if (session.role === 'STAFF') {
    const access = await checkCandidateStageWindow(db, candidateId, 'academy');
    if (!access.allowed) return NextResponse.json({success:false,error:access.message},{status:access.status});
    const { data: person, error: personError } = await db.from('rnt_personnel').select('department').eq('id', session.personnelId).eq('is_active', true).maybeSingle();
    if (personError) return NextResponse.json({success:false,error:'Departemen akses gagal diverifikasi.'},{status:503});
    const department = candidate.mapping_dept;
    if (!person?.department || person.department !== department) return NextResponse.json({success:false,error:'Absensi hanya dapat diubah oleh personel departemen kandidat.'},{status:403});
  }
  const { data: previousAttendance, error: previousAttendanceError } = await db.from('academy_attendance')
    .select('attendance_status').eq('candidate_id', String(candidateId)).eq('batch_id', batchId).maybeSingle();
  if (previousAttendanceError) return NextResponse.json({ success:false,error:'Riwayat absensi kandidat gagal dimuat.' },{status:503});
  const values = { attendance_status:status, updated_by:session.name, updated_at:new Date().toISOString() };
  const { data: attendance, error: updateError } = await db.from('academy_attendance').update(values).eq('candidate_id',String(candidateId)).eq('batch_id',batchId).select('candidate_id').maybeSingle();
  if (updateError) return NextResponse.json({success:false,error:'Absensi gagal disimpan.'},{status:500});
  if (!attendance) {
    const { error } = await db.from('academy_attendance').insert({ candidate_id:String(candidateId), batch_id:batchId, ...values });
    if (error) return NextResponse.json({success:false,error:'Absensi gagal disimpan.'},{status:500});
  }
  if (previousAttendance?.attendance_status !== status) {
    const statusName = { PENDING: 'Belum dicatat', PRESENT: 'Hadir', ABSENT: 'Tidak hadir', EXCUSED: 'Izin' };
    const { error: auditError } = await db.from('personnel_audit_logs').insert({
      personnel_id: session.personnelId,
      personnel_name: session.name,
      role: session.role,
      event: 'ACADEMY_ATTENDANCE',
      target_name: candidate.nama,
      action_details: `Mengubah absensi Academy ${candidate.nama} dari ${statusName[previousAttendance?.attendance_status] || 'Belum dicatat'} menjadi ${statusName[status]}.`,
    });
    if (auditError) console.error('Academy attendance audit failed:', auditError);
  }
  return NextResponse.json({success:true});
}
