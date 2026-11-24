import { NextResponse } from 'next/server';
import { getVerifiedInternalSession } from '@/lib/internal-session';
import { createInternalDataClient } from '@/lib/supabase-server';
import { checkCandidateStageWindow, isStageWindowOpen } from '@/lib/stage-access';
import { isSensitiveFeatureAllowed } from '@/lib/sensitive-feature-access';
import { z } from 'zod';

export async function GET(request) {
  const session = await getVerifiedInternalSession(request);
  if (!session) return NextResponse.json({ success:false,error:'Sesi personel diperlukan.' },{status:401});
  const batchId = new URL(request.url).searchParams.get('batch_id');
  if (!batchId) return NextResponse.json({ success:false,error:'Batch belum dipilih.' },{status:400});
  const db = createInternalDataClient(session);
  const { data: batch, error } = await db.from('recruitment_batches').select('id,name,academy_start,academy_end').eq('id', batchId).is('deleted_at', null).maybeSingle();
  if (error) return NextResponse.json({ success:false,error:'Jadwal Academy gagal dimuat.' },{status:503});
  if (!batch) return NextResponse.json({ success:false,error:'Batch tidak ditemukan.' },{status:404});
  const academyOpen = isStageWindowOpen(batch.academy_start, batch.academy_end, Date.now());
  const [candidateResult, attendanceResult, personnelResult] = await Promise.all([
    db.from('candidates').select('id,nama,cid,batch_id,mapping_dept,dept_preference,status_interview,status_cv,is_fast_track,fast_track_note').eq('batch_id', batchId).is('deleted_at', null).order('nama'),
    db.from('academy_attendance').select('*').eq('batch_id', batchId),
    db.from('rnt_personnel').select('id,full_name,department').eq('is_active', true).order('full_name'),
  ]);
  const failure = [candidateResult, attendanceResult, personnelResult].find((result) => result.error);
  if (failure) return NextResponse.json({ success:false,error:'Daftar absensi Academy gagal dimuat.' },{status:503});
  const personnel = personnelResult.data || [];
  const personnelDepartment = personnel.find((person) => person.id === session.personnelId)?.department || '';
  const eligibleCandidates = (candidateResult.data || []).filter((candidate) => {
    const cvStatus = String(candidate.status_cv || '').trim().toLowerCase();
    const eligibleAcademy = candidate.is_fast_track || candidate.status_interview === 'Passed';
    const eligibleReview = candidate.is_fast_track || (cvStatus && !['pending', 'rejected', 'belum direview', 'belum di-review'].includes(cvStatus));
    const eligibleDepartment = session.role !== 'STAFF' || academyOpen || candidate.mapping_dept === personnelDepartment;
    return eligibleAcademy && eligibleReview && eligibleDepartment;
  });
  const candidateIds = new Set(eligibleCandidates.map((candidate) => String(candidate.id)));
  const attendance = (attendanceResult.data || []).filter((row) => candidateIds.has(String(row.candidate_id)));
  const visiblePersonnel = session.role === 'STAFF' ? personnel.filter((person) => person.id === session.personnelId) : personnel;
  return NextResponse.json({ success:true,batches:[batch],candidates:eligibleCandidates,attendance,personnel:visiblePersonnel,department:personnelDepartment,role:session.role,personnelId:session.personnelId },{headers:{'Cache-Control':'private, no-store, max-age=0'}});
}

const fastTrackSchema = z.object({
  action: z.literal('ADD_FAST_TRACK'),
  batchId: z.uuid(),
  name: z.string().trim().min(2).max(100).refine((value) => !/[\[\]\t\r\n\u2028\u2029]/.test(value)),
  cid: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9]+$/).transform((value) => value.toUpperCase()),
  gender: z.enum(['Male', 'Female']),
  department: z.enum(['', 'LSPD', 'LSSD', 'SASP', 'DOC']).optional().default(''),
  note: z.string().max(1000).optional().default(''),
}).strict();

async function addFastTrackCandidate(db, session, values) {
  const { data: batch, error: batchError } = await db.from('recruitment_batches')
    .select('id,academy_start,academy_end').eq('id', values.batchId).is('deleted_at', null).maybeSingle();
  if (batchError) return NextResponse.json({ success: false, error: 'Batch gagal diverifikasi.' }, { status: 503 });
  if (!batch) return NextResponse.json({ success: false, error: 'Batch tidak ditemukan.' }, { status: 404 });

  let department = values.department || null;
  if (session.role === 'STAFF') {
    if (!isStageWindowOpen(batch.academy_start, batch.academy_end, Date.now())) {
      return NextResponse.json({ success: false, error: 'Fast Track hanya dapat ditambahkan selama jadwal Academy aktif.' }, { status: 403 });
    }
    const { data: person, error: personError } = await db.from('rnt_personnel')
      .select('department').eq('id', session.personnelId).eq('is_active', true).maybeSingle();
    if (personError) return NextResponse.json({ success: false, error: 'Departemen akses gagal diverifikasi.' }, { status: 503 });
    if (!person?.department) return NextResponse.json({ success: false, error: 'Departemen staff belum terdaftar.' }, { status: 403 });
    if (department && department !== person.department) return NextResponse.json({ success: false, error: 'Staff hanya dapat menambahkan Fast Track untuk departemennya sendiri.' }, { status: 403 });
    department = person.department;
  }

  const { data: existingCandidate, error: duplicateError } = await db.from('candidates')
    .select('id').eq('batch_id', values.batchId).ilike('cid', values.cid).is('deleted_at', null).limit(1).maybeSingle();
  if (duplicateError) return NextResponse.json({ success: false, error: 'Kandidat gagal diverifikasi.' }, { status: 503 });
  if (existingCandidate) return NextResponse.json({ success: false, error: 'CID sudah terdaftar pada batch ini.' }, { status: 409 });

  const { data: candidate, error: insertError } = await db.from('candidates').insert({
    batch_id: values.batchId,
    nama: values.name,
    cid: values.cid,
    gender: values.gender,
    officer_reviewer: session.name,
    link_cv: null,
    mapping_dept: department,
    status_cv: null,
    status_interview: null,
    is_fast_track: true,
    fast_track_note: values.note.trim() || null,
  }).select('id,nama,cid,gender,batch_id,mapping_dept,status_cv,status_interview,is_fast_track,fast_track_note').single();
  if (insertError) {
    console.error('Fast Track candidate insert failed:', insertError);
    return NextResponse.json({ success: false, error: insertError.code === '23505' ? 'CID sudah terdaftar pada batch ini.' : 'Kandidat Fast Track gagal disimpan.' }, { status: insertError.code === '23505' ? 409 : 500 });
  }

  const { error: auditError } = await db.from('personnel_audit_logs').insert({
    personnel_id: session.personnelId,
    personnel_name: session.name,
    role: session.role,
    event: 'FAST_TRACK_CANDIDATE',
    target_name: candidate.nama,
    action_details: `menambahkan kandidat ${candidate.nama} melalui jalur Fast Track untuk batch ${batch.id}${department ? ` (${department})` : ''}${values.note.trim() ? `; catatan: ${values.note.trim()}` : ''}.`,
  });
  if (auditError) {
    console.error('Fast Track audit log insert failed:', auditError);
    await db.from('candidates').delete().eq('id', candidate.id);
    return NextResponse.json({ success: false, error: 'Fast Track tidak dapat disimpan karena Audit Log gagal dicatat.' }, { status: 503 });
  }

  return NextResponse.json({ success: true, candidate });
}

export async function POST(request) {
  const session = await getVerifiedInternalSession(request);
  if (!session) return NextResponse.json({ success:false,error:'Sesi personel diperlukan.' },{status:401});
  if (!['STAFF', 'ADMIN'].includes(session.role)) return NextResponse.json({ success:false,error:'Sesi staff atau admin diperlukan.' },{status:403});
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ success:false,error:'Asal permintaan tidak valid.' },{status:403});
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({success:false,error:'Permintaan tidak valid.'},{status:400}); }
  if (body?.action === 'ADD_FAST_TRACK') {
    if (!await isSensitiveFeatureAllowed(session)) return NextResponse.json({ success: false, error: 'Akses Fast Track ditolak.' }, { status: 403 });
    const parsed = fastTrackSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Data Fast Track tidak valid.' }, { status: 400 });
    return addFastTrackCandidate(createInternalDataClient(session), session, parsed.data);
  }
  const validBody = z.object({ candidateId: z.string().min(1).max(100), batchId: z.uuid(), status: z.enum(['PENDING','PRESENT','ABSENT','EXCUSED']), excuseReason: z.string().trim().max(1000).optional() }).strict().safeParse(body);
  if (!validBody.success) return NextResponse.json({success:false,error:'Data absensi tidak valid.'},{status:400});
  const { candidateId, batchId, status, excuseReason } = validBody.data;
  if (status === 'EXCUSED' && !excuseReason) return NextResponse.json({success:false,error:'Alasan izin wajib diisi.'},{status:400});
  const db = createInternalDataClient(session);
  const { data: schedule, error: scheduleError } = await db.from('recruitment_batches').select('academy_start,academy_end').eq('id', batchId).is('deleted_at', null).maybeSingle();
  if (scheduleError) return NextResponse.json({success:false,error:'Jadwal Academy gagal diverifikasi.'},{status:503});
  if (!schedule) return NextResponse.json({success:false,error:'Batch tidak ditemukan.'},{status:404});
  const academyOpen = isStageWindowOpen(schedule.academy_start, schedule.academy_end, Date.now());
  if (!academyOpen && !['EXCUSED', 'PENDING'].includes(status)) return NextResponse.json({success:false,error:'Hadir dan Tidak Hadir hanya dapat dicatat selama jadwal Academy aktif.'},{status:403});
  const { data: candidate, error: candidateError } = await db.from('candidates').select('nama,batch_id,mapping_dept,dept_preference,status_interview,status_cv,is_fast_track').eq('id', candidateId).is('deleted_at', null).maybeSingle();
  if (candidateError) return NextResponse.json({success:false,error:'Kandidat gagal diverifikasi.'},{status:503});
  if (!candidate || candidate.batch_id !== batchId) return NextResponse.json({success:false,error:'Kandidat tidak ditemukan pada batch ini.'},{status:404});
  const cvStatus = String(candidate.status_cv || '').trim().toLowerCase();
  if (!candidate.is_fast_track && (candidate.status_interview !== 'Passed' || !cvStatus || ['pending', 'rejected', 'belum direview', 'belum di-review'].includes(cvStatus))) return NextResponse.json({success:false,error:'Kandidat belum memenuhi syarat Academy.'},{status:403});
  if (session.role === 'STAFF') {
    const access = await checkCandidateStageWindow(db, candidateId, 'academy');
    if (!access.allowed && !['EXCUSED', 'PENDING'].includes(status)) return NextResponse.json({success:false,error:access.message},{status:access.status});
    const { data: person, error: personError } = await db.from('rnt_personnel').select('department').eq('id', session.personnelId).eq('is_active', true).maybeSingle();
    if (personError) return NextResponse.json({success:false,error:'Departemen akses gagal diverifikasi.'},{status:503});
    const department = candidate.mapping_dept;
    if (!person?.department || person.department !== department) return NextResponse.json({success:false,error:'Absensi hanya dapat diubah oleh personel departemen kandidat.'},{status:403});
  }
  const { data: previousAttendance, error: previousAttendanceError } = await db.from('academy_attendance')
    .select('attendance_status,excuse_reason').eq('candidate_id', String(candidateId)).eq('batch_id', batchId).maybeSingle();
  if (previousAttendanceError) return NextResponse.json({ success:false,error:'Riwayat absensi kandidat gagal dimuat.' },{status:503});
  const values = { attendance_status:status, excuse_reason:status === 'EXCUSED' ? excuseReason : null, updated_by:session.name, updated_at:new Date().toISOString() };
  const { data: attendance, error: updateError } = await db.from('academy_attendance').update(values).eq('candidate_id',String(candidateId)).eq('batch_id',batchId).select('candidate_id').maybeSingle();
  if (updateError) return NextResponse.json({success:false,error:'Absensi gagal disimpan.'},{status:500});
  if (!attendance) {
    const { error } = await db.from('academy_attendance').insert({ candidate_id:String(candidateId), batch_id:batchId, ...values });
    if (error) return NextResponse.json({success:false,error:'Absensi gagal disimpan.'},{status:500});
  }
  if (previousAttendance?.attendance_status !== status || previousAttendance?.excuse_reason !== values.excuse_reason) {
    const statusName = { PENDING: 'Belum dicatat', PRESENT: 'Hadir', ABSENT: 'Tidak hadir', EXCUSED: 'Izin' };
    const { error: auditError } = await db.from('personnel_audit_logs').insert({
      personnel_id: session.personnelId,
      personnel_name: session.name,
      role: session.role,
      event: 'ACADEMY_ATTENDANCE',
      target_name: candidate.nama,
      action_details: `Mengubah absensi Academy ${candidate.nama} dari ${statusName[previousAttendance?.attendance_status] || 'Belum dicatat'} menjadi ${statusName[status]}${status === 'EXCUSED' ? ` (Alasan: ${excuseReason})` : ''}.`,
    });
    if (auditError) console.error('Academy attendance audit failed:', auditError);
  }
  return NextResponse.json({success:true});
}
