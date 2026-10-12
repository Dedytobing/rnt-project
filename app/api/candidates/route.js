import { NextResponse } from 'next/server';
import { appendReviewerName } from '@/lib/reviewers';
import { isCandidateServiceConfigured, registerCandidate } from '@/lib/candidate-registration';
import { getInternalSession } from '@/lib/internal-session';
import { createInternalDataClient } from '@/lib/supabase-server';
import { candidateActionSchema, candidateQuerySchema, readValidatedJson } from '@/lib/validation';
import { enforceRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { checkCandidateStageWindow } from '@/lib/stage-access';

function isMissingPreferenceColumn(error) {
  return ['PGRST204', '42703'].includes(error?.code) &&
    String(error?.message || '').includes('dept_preference');
}

// GET: Ambil Data Kandidat / Log Spesifik Kandidat
export async function GET(request) {
  try {
    const session = getInternalSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Sesi staff diperlukan.' }, { status: 401 });
    }
    const supabase = createInternalDataClient(session);

    const { searchParams } = new URL(request.url);
    const query = candidateQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!query.success) return NextResponse.json({ success: false, error: 'Filter permintaan tidak valid.' }, { status: 400 });
    const candidateId = query.data.candidate_id;
    if (query.data.deleted === 'true' && session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Data terhapus hanya dapat diakses Admin RNT.' }, { status: 403 });
    }
    // Jika dipanggil dengan candidate_id -> kembalikan histori log kandidat tersebut
    if (candidateId) {
      const { data: logs, error: logErr } = await supabase.rpc('get_candidate_logs', {
        p_candidate_id: candidateId,
      });

      if (logErr) {
        console.error('Candidate audit log query failed:', logErr);
        return NextResponse.json({ success: false, error: 'Riwayat kandidat gagal dimuat.' }, { status: 500 });
      }
      return NextResponse.json({ success: true, logs }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    // GET Seluruh Kandidat
    let batchId = query.data.batch_id;
    if (!batchId && query.data.deleted !== 'true') {
      const { data: activeBatch, error: batchError } = await supabase.from('recruitment_batches').select('id').eq('is_active', true).is('deleted_at', null).maybeSingle();
      if (batchError) return NextResponse.json({ success: false, error: 'Batch aktif gagal dimuat.' }, { status: 503 });
      batchId = activeBatch?.id;
    }
    if (!batchId && query.data.deleted !== 'true') return NextResponse.json({ success: true, data: [] }, { headers: { 'Cache-Control': 'private, no-store' } });
    if (batchId) {
      const { data: visibleBatch, error: visibleBatchError } = await supabase.from('recruitment_batches').select('id').eq('id', batchId).is('deleted_at', null).maybeSingle();
      if (visibleBatchError) return NextResponse.json({ success: false, error: 'Batch gagal diverifikasi.' }, { status: 503 });
      if (!visibleBatch) return NextResponse.json({ success: false, error: 'Batch tidak ditemukan.' }, { status: 404 });
    }
    if (query.data.stage) {
      const { data: stageBatch, error: stageError } = await supabase.from('recruitment_batches').select(`${query.data.stage}_start,${query.data.stage}_end`).eq('id', batchId).is('deleted_at', null).maybeSingle();
      if (stageError || !stageBatch) return NextResponse.json({ success: false, error: 'Jadwal tahap gagal diverifikasi.' }, { status: 503 });
      const now = Date.now();
      if (now < Date.parse(stageBatch[`${query.data.stage}_start`]) || now > Date.parse(stageBatch[`${query.data.stage}_end`])) {
        return NextResponse.json({ success: false, error: `Akses ${query.data.stage} belum dibuka atau sudah ditutup sesuai jadwal batch.` }, { status: 403 });
      }
    }
    let candidateQuery = supabase
      .from('candidates')
      .select('*')
      .order('created_at', { ascending: false });
    candidateQuery = query.data.deleted === 'true'
      ? candidateQuery.not('deleted_at', 'is', null)
      : candidateQuery.is('deleted_at', null);
    if (batchId) candidateQuery = candidateQuery.eq('batch_id', batchId);
    const { data, error } = await candidateQuery;

    if (error) {
      console.error('Candidate list query failed:', error);
      return NextResponse.json({ success: false, error: 'Data kandidat gagal dimuat.' }, { status: 500 });
    }

    const cleanData = (data || []).map(c => ({
      ...c,
      status_cv: ['Passed', 'Failed'].includes(c.status_interview) && ['Accepted', 'Rejected'].includes(c.status_cv)
        ? 'Interview'
        : c.status_cv || '',
      mdt_check: c.mdt_check || '',
      mapping_dept: c.mapping_dept || '',
      dept_preference: c.dept_preference || '',
      status_interview: c.status_interview || ''
    }));

    return NextResponse.json({ success: true, data: cleanData }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    console.error('Candidates API GET failed:', err);
    return NextResponse.json({ success: false, error: 'Data kandidat gagal dimuat.' }, { status: 500 });
  }
}

// POST: Aksi Update & Registrasi
export async function POST(request) {
  try {
    const requestLimited = await enforceRateLimit(request, {
      namespace: 'candidate-api',
      limit: 60,
      windowSeconds: 10 * 60,
    });
    const requestRateError = rateLimitResponse(requestLimited);
    if (requestRateError) return requestRateError;

    const parsedBody = await readValidatedJson(request, candidateActionSchema);
    if (!parsedBody.data) {
      return NextResponse.json({ success: false, error: parsedBody.error }, { status: parsedBody.status });
    }
    const body = parsedBody.data;
    const { action } = body;

    // 1. TAMBAH KANDIDAT BARU (Public Form)
    if (action === 'ADD_CANDIDATE') {
      const limited = await enforceRateLimit(request, { namespace: 'candidate-registration', limit: 5, windowSeconds: 60 * 60 });
      const rateError = rateLimitResponse(limited);
      if (rateError) return rateError;
      if (!isCandidateServiceConfigured()) {
        return NextResponse.json({ success: false, error: 'Layanan pendaftaran belum dikonfigurasi.' }, { status: 503 });
      }

      const { nama: candidateName, gender: candidateGender, linkCv: candidateCv, batchId } = body;
      const { data: registration, error } = await registerCandidate({
        name: candidateName,
        gender: candidateGender,
        cvUrl: candidateCv,
        batchId,
      });

      if (error) {
        console.error('Candidate registration insert failed:', error);
        return NextResponse.json({ success: false, error: 'Data kandidat gagal disimpan. Coba lagi nanti.' }, { status: 500 });
      }
      if (registration?.status === 'duplicate') {
        return NextResponse.json({ success: false, error: 'Nama atau Link CV sudah terdaftar!' }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: 'CV berhasil didaftarkan!' });
    }

    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ success: false, error: 'Asal permintaan tidak valid.' }, { status: 403 });
    }
    const session = getInternalSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Sesi staff diperlukan.' }, { status: 401 });
    const supabase = createInternalDataClient(session);

    if (session.role === 'STAFF' && ['UPDATE_EVALUATION', 'UPDATE_INTERVIEW'].includes(action)) {
      const stage = action === 'UPDATE_EVALUATION' ? 'review' : 'interview';
      const access = await checkCandidateStageWindow(supabase, body.id, stage);
      if (!access.allowed) return NextResponse.json({ success: false, error: access.message }, { status: access.status });
    }

    // 2. EVALUASI CV (Staff / Evaluator)
    if (action === 'UPDATE_EVALUATION') {
      const { id, statusCv, mdtCheck, catatan, saran, notesInvestigator } = body;
      const staffName = session.name;

      const { data: currentCandidate, error: currentCandidateError } = await supabase
        .from('candidates')
        .select('officer_reviewer')
        .eq('id', id)
        .maybeSingle();

      if (currentCandidateError) {
        console.error('Candidate review lookup failed:', currentCandidateError);
        return NextResponse.json({ success: false, error: 'Evaluasi kandidat gagal dimuat.' }, { status: 500 });
      }

      if (!currentCandidate) {
        return NextResponse.json({ success: false, error: 'Kandidat tidak ditemukan.' }, { status: 404 });
      }

      const reviewerNames = appendReviewerName(currentCandidate.officer_reviewer, staffName);

      const { error } = await supabase.from('candidates').update({
        status_cv: statusCv,
        mdt_check: mdtCheck,
        officer_reviewer: reviewerNames,
        catatan,
        saran,
        notes_investigator: notesInvestigator,
        updated_at: new Date()
      }).eq('id', id);

      if (error) {
        console.error('Candidate review update failed:', error);
        return NextResponse.json({ success: false, error: 'Evaluasi kandidat gagal disimpan.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Evaluasi CV berhasil disimpan!' });
    }

    // 3. SESI WAWANCARA (Interviewer)
    if (action === 'UPDATE_INTERVIEW') {
      const { id, assistName, statusInterview, deptPreference = '', notesInterviewer } = body;
      if (!['', 'LSSD', 'LSPD'].includes(deptPreference)) {
        return NextResponse.json({ success: false, error: 'Preferensi departemen tidak valid.' }, { status: 400 });
      }

      if (!['Passed', 'Pending', 'Failed'].includes(statusInterview)) {
        return NextResponse.json({ success: false, error: 'Hasil interview tidak valid.' }, { status: 400 });
      }

      const interviewUpdate = {
        interviewer_name: session.name,
        assist_name: assistName,
        status_interview: statusInterview,
        dept_preference: deptPreference || null,
        notes_interviewer: notesInterviewer,
        updated_at: new Date()
      };

      let { error } = await supabase.from('candidates').update(interviewUpdate).eq('id', id);
      let preferenceSaved = true;
      if (isMissingPreferenceColumn(error)) {
        const { dept_preference: omittedPreference, ...compatibleUpdate } = interviewUpdate;
        const fallback = await supabase.from('candidates').update(compatibleUpdate).eq('id', id);
        error = fallback.error;
        preferenceSaved = false;
      }

      if (error) {
        console.error('Candidate interview update failed:', error);
        return NextResponse.json({ success: false, error: 'Hasil interview gagal disimpan.' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        preferenceSaved,
        message: preferenceSaved
          ? 'Hasil interview berhasil disimpan!'
          : 'Hasil interview tersimpan, tetapi preferensi departemen belum tersimpan. Terapkan migrasi database terlebih dahulu.'
      });
    }

    // 4. OVERRIDE ADMIN (Team RED)
    if (action === 'ADMIN_OVERRIDE_CANDIDATE') {
      if (session?.role !== 'ADMIN') {
        return NextResponse.json({ success: false, error: 'Hanya Team RED yang dapat mengubah keputusan akhir.' }, { status: 403 });
      }
      const { id, nama, linkCv, statusCv, mdtCheck, mappingDept, statusInterview, catatan, notesInvestigator, notesInterviewer, departmentOnly } = body;

      if (mappingDept && !['LSSD', 'LSPD'].includes(mappingDept)) {
        return NextResponse.json({ success: false, error: 'Departemen final tidak valid.' }, { status: 400 });
      }

      if (departmentOnly) {
        if (!id || !['LSSD', 'LSPD'].includes(mappingDept)) {
          return NextResponse.json({ success: false, error: 'Kandidat dan departemen final wajib dipilih.' }, { status: 400 });
        }

        const { data: candidate, error: candidateError } = await supabase
          .from('candidates')
          .select('nama, status_cv, status_interview')
          .eq('id', id)
          .maybeSingle();

        if (candidateError) return NextResponse.json({ success: false, error: 'Data penempatan gagal dimuat.' }, { status: 500 });
        if (!candidate) return NextResponse.json({ success: false, error: 'Kandidat tidak ditemukan.' }, { status: 404 });
        if (candidate.status_interview !== 'Passed') {
          return NextResponse.json({ success: false, error: 'Departemen final hanya dapat ditetapkan untuk kandidat yang lulus interview.' }, { status: 409 });
        }

        const { error } = await supabase.from('candidates').update({
          mapping_dept: mappingDept,
          updated_at: new Date(),
        }).eq('id', id);

        if (error) return NextResponse.json({ success: false, error: 'Penempatan gagal disimpan.' }, { status: 500 });
        return NextResponse.json({ success: true, message: `Penempatan final ${candidate.nama} diperbarui ke ${mappingDept}.` });
      }

      const updates = {
        nama,
        ...(linkCv ? { link_cv: linkCv } : {}),
        status_cv: statusCv,
        mdt_check: mdtCheck,
        status_interview: statusInterview,
        catatan,
        notes_investigator: notesInvestigator,
        notes_interviewer: notesInterviewer,
        updated_at: new Date()
      };
      if (mappingDept) updates.mapping_dept = mappingDept;

      const { error } = await supabase.from('candidates').update(updates).eq('id', id);

      if (error) return NextResponse.json({ success: false, error: 'Perubahan kandidat gagal disimpan.' }, { status: 500 });

      return NextResponse.json({ success: true, message: 'Data kandidat diperbarui oleh Team RED!' });
    }

    return NextResponse.json({ success: false, error: 'Aksi tidak valid.' }, { status: 400 });
  } catch (err) {
    console.error('Candidates API request failed:', err);
    return NextResponse.json({ success: false, error: 'Permintaan belum dapat diproses.' }, { status: 500 });
  }
}
