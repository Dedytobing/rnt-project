import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { appendReviewerName } from '@/lib/reviewers';
import { getInternalSession } from '@/lib/internal-session';

// Helper pencetak log aktivitas dengan Logging Terminal Error
async function createAuditLog(candidateId, officerName, roleAction, details) {
  if (!candidateId || !officerName) {
    console.warn('⚠️ Audit Log dibatalkan: candidateId atau officerName kosong.');
    return;
  }

  const { error } = await supabase.from('candidate_logs').insert([
    {
      candidate_id: candidateId,
      officer_name: officerName,
      role_action: roleAction,
      action_details: details
    }
  ]);

  if (error) {
    console.error('❌ Error simpan candidate_logs di Supabase:', error.message);
  } else {
    console.log(`✅ Audit Log tersimpan: [${officerName}] - [${roleAction}]`);
  }
}

function isMissingPreferenceColumn(error) {
  return ['PGRST204', '42703'].includes(error?.code) &&
    String(error?.message || '').includes('dept_preference');
}

// GET: Ambil Data Kandidat / Log Spesifik Kandidat
export async function GET(request) {
  try {
    if (!getInternalSession(request)) {
      return NextResponse.json({ success: false, error: 'Sesi staff diperlukan.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const candidateId = searchParams.get('candidate_id');

    // Jika dipanggil dengan candidate_id -> kembalikan histori log kandidat tersebut
    if (candidateId) {
      const { data: logs, error: logErr } = await supabase
        .from('candidate_logs')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false });

      if (logErr) {
        console.error('Candidate audit log query failed:', logErr);
        return NextResponse.json({ success: false, error: logErr.message, code: logErr.code }, { status: 500 });
      }
      return NextResponse.json({ success: true, logs });
    }

    // GET Seluruh Kandidat
    const { data, error } = await supabase
      .from('candidates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Candidate list query failed:', error);
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 500 });
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

    return NextResponse.json({ success: true, data: cleanData });
  } catch (err) {
    console.error('Candidates API GET failed:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Aksi Update & Registrasi
export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;

    // 1. TAMBAH KANDIDAT BARU (Public Form)
    if (action === 'ADD_CANDIDATE') {
      const { nama, gender, linkCv } = body;
      const candidateName = typeof nama === 'string' ? nama.trim() : '';
      const candidateGender = typeof gender === 'string' ? gender.trim() : '';
      const candidateCv = typeof linkCv === 'string' ? linkCv.trim() : '';

      if (!candidateName || !['Male', 'Female'].includes(candidateGender) || !candidateCv) {
        return NextResponse.json({ success: false, error: 'Nama, gender, dan tautan CV wajib diisi dengan format yang valid.' }, { status: 400 });
      }

      try {
        const parsedCv = new URL(candidateCv);
        if (!['http:', 'https:'].includes(parsedCv.protocol)) throw new Error('Unsupported protocol');
      } catch {
        return NextResponse.json({ success: false, error: 'Tautan CV harus berupa URL http atau https yang valid.' }, { status: 400 });
      }

      const { data: existing, error: duplicateCheckError } = await supabase
        .from('candidates')
        .select('id')
        .or(`nama.ilike.${candidateName},link_cv.eq.${candidateCv}`);

      if (duplicateCheckError) {
        console.error('Candidate duplicate check failed:', duplicateCheckError);
        return NextResponse.json({ success: false, error: `Pemeriksaan duplikasi gagal: ${duplicateCheckError.message}` }, { status: 500 });
      }

      if (existing && existing.length > 0) {
        return NextResponse.json({ 
          success: false, 
          error: 'Nama atau Link CV sudah terdaftar!' 
        }, { status: 400 });
      }

      const { data: newCand, error } = await supabase.from('candidates').insert([
        { nama: candidateName, gender: candidateGender, link_cv: candidateCv }
      ]).select().single();

      if (error) {
        console.error('Candidate registration insert failed:', error);
        return NextResponse.json({ success: false, error: `Data kandidat gagal disimpan: ${error.message}` }, { status: 500 });
      }

      await createAuditLog(newCand.id, 'Sistem Publik', 'REGISTER', 'Kandidat mendaftarkan CV baru.');
      return NextResponse.json({ success: true, message: 'CV berhasil didaftarkan!' });
    }

    // 2. EVALUASI CV (Staff / Evaluator)
    if (action === 'UPDATE_EVALUATION') {
      const session = getInternalSession(request);
      if (!session) return NextResponse.json({ success: false, error: 'Sesi staff diperlukan.' }, { status: 401 });
      const { id, statusCv, mdtCheck, catatan, saran, notesInvestigator } = body;
      const staffName = session.name;

      const { data: currentCandidate, error: currentCandidateError } = await supabase
        .from('candidates')
        .select('officer_reviewer')
        .eq('id', id)
        .maybeSingle();

      if (currentCandidateError) {
        return NextResponse.json({ success: false, error: currentCandidateError.message }, { status: 500 });
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

      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

      await createAuditLog(
        id, 
        staffName,
        'REVIEW_CV', 
        `Mengubah Status CV: [${statusCv}], MDT Check: [${mdtCheck}]. Catatan: ${catatan || '-'}`
      );

      return NextResponse.json({ success: true, message: 'Evaluasi CV berhasil disimpan!' });
    }

    // 3. SESI WAWANCARA (Interviewer)
    if (action === 'UPDATE_INTERVIEW') {
      const session = getInternalSession(request);
      if (!session) return NextResponse.json({ success: false, error: 'Sesi staff diperlukan.' }, { status: 401 });
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

      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

      await createAuditLog(
        id, 
        session.name,
        'INTERVIEW', 
        `Hasil Interview: [${statusInterview}], Preferensi Departemen: [${deptPreference || 'Tidak ada'}]${preferenceSaved ? '' : ' (belum tersimpan: kolom dept_preference belum tersedia)'}. Status CV tetap pada tahap [Interview].`
      );

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
      const session = getInternalSession(request);
      if (session?.role !== 'ADMIN') {
        return NextResponse.json({ success: false, error: 'Hanya Team RED yang dapat mengubah keputusan akhir.' }, { status: 403 });
      }
      const { id, nama, statusCv, mdtCheck, mappingDept, statusInterview, catatan, notesInvestigator, notesInterviewer, departmentOnly } = body;

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

        if (candidateError) return NextResponse.json({ success: false, error: candidateError.message }, { status: 500 });
        if (!candidate) return NextResponse.json({ success: false, error: 'Kandidat tidak ditemukan.' }, { status: 404 });
        if (candidate.status_interview !== 'Passed') {
          return NextResponse.json({ success: false, error: 'Departemen final hanya dapat ditetapkan untuk kandidat yang lulus interview.' }, { status: 409 });
        }

        const { error } = await supabase.from('candidates').update({
          mapping_dept: mappingDept,
          updated_at: new Date(),
        }).eq('id', id);

        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        await createAuditLog(id, session.name, 'ADMIN_OVERRIDE', `Team RED menetapkan departemen final ${mappingDept} untuk ${candidate.nama}.`);
        return NextResponse.json({ success: true, message: `Penempatan final ${candidate.nama} diperbarui ke ${mappingDept}.` });
      }

      const updates = {
        nama,
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

      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

      await createAuditLog(
        id, 
        session.name,
        'ADMIN_OVERRIDE', 
        `Admin Team RED melakukan override data kandidat. Status CV: [${statusCv}], Department final: [${mappingDept || 'tidak diubah'}].`
      );

      return NextResponse.json({ success: true, message: 'Data kandidat diperbarui oleh Team RED!' });
    }

    return NextResponse.json({ success: false, error: 'Aksi tidak valid.' }, { status: 400 });
  } catch (err) {
    console.error('Candidates API request failed:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
