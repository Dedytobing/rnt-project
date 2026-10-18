'use client';
import { useState, useEffect, useContext, useRef } from 'react';
import Image from 'next/image';
import CandidateLogs from '../components/CandidateLogs';
import Pagination, { PAGE_SIZE } from '../components/Pagination';
import { BatchContext, candidatesUrl } from '../BatchContext';
import { DECLINED_REASON_OPTIONS, createDeclinedBbcode } from '@/lib/interview-declined-template';

const LOGO_LSSD = '/logos/lssd.png';
const LOGO_LSPD = '/logos/lspd.png';
const LOGO_DOC = '/logos/doc.png';
function formatAcademySchedule(batch) {
  const start = new Date(batch?.academy_start || '');
  const end = new Date(batch?.academy_end || '');
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return { date: 'Belum diatur', time: 'Belum diatur', available: false };
  }
  const dateFormatter = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Jakarta' });
  const timeFormatter = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta' });
  return {
    date: dateFormatter.format(start),
    time: `${timeFormatter.format(start)} GMT+7 (WIB)`,
    available: true,
  };
}

function createAcademyBbcode(candidate, staffProfile, batch) {
  const departmentNames = {
    LSSD: "Los Santos Sheriff's Department",
    LSPD: 'Los Santos Police Department',
    SASP: 'San Andreas State Police',
    DOC: 'Department of Corrections',
  };
  const officerDepartment = departmentNames[staffProfile.department] || staffProfile.department;
  const signature = [
    staffProfile.name,
    staffProfile.rank,
    staffProfile.position,
    officerDepartment,
  ]
    .filter(Boolean).join('\n');
  const schedule = formatAcademySchedule(batch);

  return `[divbox=white]
[center][img]https://imagizer.imageshack.com/v2/200x200q70/924/Rs1Hi8.png[/img][img]https://imagizer.imageshack.com/img924/9329/WjRSSl.png[/img][img]https://imageshack.com/i/pogQ42LOp[/img][/center]
[center][size=200][b]LAW ENFORCEMENT OFFICER[/b][/size][/center]
[center][size=100][b]Recruitment and Training Divison[/b][/size][/center]
[divbox=darkblue][/divbox]
Dear Mrs. ${candidate.nama},

We are pleased to inform you that you have successfully [b][color=#408000]PASSED[/color][/b] the interview stage of the Law Enforcement Officer recruitment process. Your performance and responses during the interview demonstrated the qualities we seek in a future officer.

You are now one step away from officially joining the [b]LEO Academy[/b]. The final requirement is your attendance at the upcoming academy session, where you will receive foundational training before entering active duty as a Probationary Officer.

Please take note of the following details regarding the Academy:

📅 Date: ${schedule.date}
⏰ Time: ${schedule.time}
📍 Location: Alta HQ

Your attendance is mandatory, and punctuality is expected. Please arrive in appropriate attire (business casual or department-approved clothing) and be prepared for your initial orientation and training.

⚠️ Important Notice:
If you fail to attend the academy session or fail to communicate with the Recruitment Division prior to the scheduled time, your application will be considered withdrawn and will be terminated from the current batch. You will need to reapply during the next recruitment cycle if you still wish to pursue a position within the department.

If you have any questions or require further assistance, please contact a Recruitment Officer or visit us directly at [b]Alta Station HQ[/b].

We look forward to welcoming you to the Academy.

[right]Sincerely,
${signature || 'Recruitment Staff'}[/right]
[/divbox]`;
}

export default function InterviewPage() {
  const { selectedBatch } = useContext(BatchContext);
  const [candidates, setCandidates] = useState([]);
  const [queueTab, setQueueTab] = useState('pending');
  const [selectedId, setSelectedId] = useState('');
  const [selectedCandidateData, setSelectedCandidateData] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ 
    deptPreference: '',
    interviewerName: '',
    assistName: '', 
    statusInterview: '', 
    notesInterviewer: '' 
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [validationError, setValidationError] = useState('');
  const [stageAccessError, setStageAccessError] = useState('');
  const [academyMessage, setAcademyMessage] = useState('');
  const [declinedReason, setDeclinedReason] = useState('');
  const [staffProfile, setStaffProfile] = useState({ name: '', rank: '', position: '', department: '' });
  const academyPreviewRef = useRef(null);

  useEffect(() => {
    let active = true;
    fetch('/api/internal/session', { cache: 'no-store' })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!active || !response.ok || !data.authenticated) return;
        setStaffProfile({
          name: data.officerName || '',
          rank: data.officerRank || '',
          position: data.officerPosition || '',
          department: data.officerDepartment || '',
        });
      }).catch(() => {});
    return () => { active = false; };
  }, []);

  const fetchData = async () => {
    const res = await fetch(candidatesUrl(selectedBatch?.id, 'interview'));
    const data = await res.json();
    if (data.success) {
      setCandidates(data.data.filter(c => c.status_cv === 'Interview'));
      setCurrentPage(1);
    }
  };

  useEffect(() => {
    let active = true;
    const loadStage = () => fetch(candidatesUrl(selectedBatch?.id, 'interview'))
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!active) return;
        if (!response.ok || !data.success) { setStageAccessError(data.error || 'Akses interview belum dibuka.'); setCandidates([]); setSelectedId(''); return; }
        setStageAccessError('');
        setCandidates(data.data.filter((candidate) => candidate.status_cv === 'Interview'));
      }).catch(() => { if (active) { setCandidates([]); setStageAccessError('Jadwal interview gagal diverifikasi.'); } });
    loadStage();
    const timer = window.setInterval(loadStage, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selectedBatch?.id]);

  const pendingCandidates = candidates.filter((candidate) => !candidate.status_interview || candidate.status_interview === '');
  const completedCandidates = candidates.filter((candidate) => Boolean(candidate.status_interview));
  const tabCandidates = queueTab === 'completed' ? completedCandidates : pendingCandidates;
  const displayedCandidates = tabCandidates.filter((candidate) =>
    candidate.nama.toLowerCase().includes(search.toLowerCase())
  );
  const paginatedCandidates = displayedCandidates.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSelect = (cand) => {
    setSelectedId(cand.id);
    setSelectedCandidateData(cand);
    setAcademyMessage('');
    setDeclinedReason('');
    setForm({
      deptPreference: cand.dept_preference || '',
      interviewerName: cand.interviewer_name || '',
      assistName: cand.assist_name || '',
      statusInterview: cand.status_interview || '',
      notesInterviewer: cand.notes_interviewer || ''
    });
    setValidationError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedId) return;
    if (!form.statusInterview) {
      setValidationError('Pilih hasil wawancara sebelum menyimpan.');
      return;
    }
    setValidationError('');

    setLoading(true);
    
    const res = await fetch(candidatesUrl(selectedBatch?.id, 'interview'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'UPDATE_INTERVIEW', 
        id: selectedId, 
        ...form 
      })
    });
    
    const data = await res.json();
    setLoading(false);
    
    if (data.success) {
      const updatedFields = {
        dept_preference: form.deptPreference,
        interviewer_name: form.interviewerName,
        assist_name: form.assistName,
        status_interview: form.statusInterview,
        notes_interviewer: form.notesInterviewer,
      };
      setMsg(form.statusInterview === 'Passed' || form.statusInterview === 'Failed' ? '' : data.message);
      setSelectedCandidateData((candidate) => candidate?.id === selectedId ? {
        ...candidate,
        ...updatedFields,
      } : candidate);
      setCandidates((current) => current.map((candidate) => candidate.id === selectedId
        ? { ...candidate, ...updatedFields }
        : candidate));
      if (form.statusInterview === 'Passed') {
        setQueueTab('completed');
        setCurrentPage(1);
      }
      fetchData();
      setTimeout(() => setMsg(''), 3000);
    }
  };

  const selectedCand = selectedCandidateData?.id === selectedId
    ? selectedCandidateData
    : candidates.find(c => c.id === selectedId);
  const academySchedule = formatAcademySchedule(selectedBatch);
  const academyPassed = Boolean(selectedCand?.status_interview === 'Passed' && form.statusInterview === 'Passed');
  const academyStaffReady = Boolean(staffProfile.name.trim());
  const academyBbcode = selectedCand && academyPassed
    ? createAcademyBbcode(selectedCand, staffProfile, selectedBatch)
    : '';
  const declinedBbcode = selectedCand && form.statusInterview === 'Failed' && declinedReason
    ? createDeclinedBbcode(selectedCand, declinedReason, staffProfile)
    : '';
  const interviewResultBbcode = form.statusInterview === 'Failed' ? declinedBbcode : academyBbcode;
  const updateAcademyTemplateData = (updates) => {
    setForm((current) => ({ ...current, ...updates }));
    setAcademyMessage('');
  };

  const copyAcademyBbcode = async (previewRef = academyPreviewRef) => {
    if (!selectedCand || !interviewResultBbcode) return;
    if (!academyStaffReady) {
      setAcademyMessage('Profil petugas yang login belum tersedia.');
      return;
    }
    if (form.statusInterview === 'Passed' && !academySchedule.available) {
      setAcademyMessage('Jadwal Academy untuk batch ini belum diatur.');
      return;
    }
    try {
      await navigator.clipboard.writeText(interviewResultBbcode);
      setAcademyMessage(form.statusInterview === 'Failed' ? 'Template Declined berhasil disalin.' : 'Template Academy berhasil disalin.');
    } catch {
      const preview = previewRef.current;
      preview?.focus();
      preview?.select();
      const copied = preview && document.execCommand('copy');
      setAcademyMessage(copied ? (form.statusInterview === 'Failed' ? 'Template Declined berhasil disalin.' : 'Template Academy berhasil disalin.') : 'Clipboard tidak tersedia. Pilih dan salin kode dari pratinjau.');
    }
  };

  return (
    <div className="interview-page space-y-4">
      {stageAccessError && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{stageAccessError}</div>}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <h1 className="text-xl font-bold text-slate-800">Sesi Wawancara (Interview Panel)</h1>
        <p className="text-xs text-slate-500">Catat hasil wawancara dan minat departemen kandidat. Penempatan akhir ditentukan Team RED.</p>
      </div>

      {msg && (
        <div className="p-3 bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-lg">
          {msg}
        </div>
      )}

      {/* LAYOUT 2-KOLOM */}
      <div className="grid grid-cols-12 gap-6 items-start">
        
        {/* PANEL KIRI */}
        <div className="col-span-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="font-bold text-xs text-slate-600 uppercase tracking-wider border-b border-slate-100 pb-2 flex justify-between items-center">
            <span>Antrean Interview</span>
            <span className="bg-blue-100 text-blue-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
              {displayedCandidates.length}
            </span>
          </div>

          <div className="interview-queue-tabs" role="tablist" aria-label="Filter antrean wawancara">
            <button type="button" role="tab" aria-selected={queueTab === 'pending'} className={queueTab === 'pending' ? 'active' : ''} onClick={() => { setQueueTab('pending'); setCurrentPage(1); }}>
              Belum Di-interview <span>{pendingCandidates.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={queueTab === 'completed'} className={queueTab === 'completed' ? 'active' : ''} onClick={() => { setQueueTab('completed'); setCurrentPage(1); }}>
              Sudah Di-interview <span>{completedCandidates.length}</span>
            </button>
          </div>

          <input 
            type="text" 
            placeholder="Cari nama kandidat..." 
            className="w-full border border-slate-300 p-2 rounded-lg text-xs text-slate-900 bg-white focus:outline-none focus:border-blue-500" 
            value={search} 
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
          />

          <div className="max-h-[500px] overflow-y-auto space-y-2 pr-1">
            {displayedCandidates.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">{queueTab === 'pending' ? 'Tidak ada kandidat yang belum di-interview.' : 'Belum ada kandidat yang selesai di-interview.'}</div>
            ) : (
              paginatedCandidates.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className={`w-full text-left p-3 rounded-xl border transition flex flex-col gap-1 ${
                    c.id === selectedId 
                      ? 'bg-blue-50/80 border-blue-500 shadow-sm' 
                      : 'bg-slate-50/50 border-slate-200 hover:bg-slate-100/80'
                  }`}>
                  <div className="flex justify-between items-center">
                    <span className="flex min-w-0 items-center gap-2"><span className="font-bold text-xs text-slate-800 truncate">{c.nama}</span>{c.is_blacklisted && <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-extrabold text-rose-800">⚠️ BLACKLISTED</span>}</span>
                    <span className={`interview-queue-status ${c.status_interview === 'Passed' ? 'passed' : c.status_interview === 'Failed' ? 'failed' : c.status_interview === 'Pending' ? 'pending' : 'ready'}`}>
                      {c.status_interview === 'Passed' ? 'Passed' : c.status_interview === 'Failed' ? 'Failed' : c.status_interview === 'Pending' ? 'Pending' : 'Belum interview'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-slate-500">
                    <span>{c.gender}</span>
                    {c.mdt_check && (
                      <span className={`font-semibold text-[10px] ${
                        c.mdt_check === 'Green' ? 'text-emerald-600' :
                        c.mdt_check === 'Yellow' ? 'text-amber-600' : 'text-rose-600'
                      }`}>
                        MDT: {c.mdt_check}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
          <Pagination page={currentPage} totalItems={displayedCandidates.length} onPageChange={setCurrentPage} />
        </div>

        {/* PANEL KANAN */}
        <div className="col-span-8 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          {!selectedCand ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-2">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 text-xl font-bold">←</div>
              <h3 className="font-bold text-sm text-slate-700">Pilih Kandidat</h3>
              <p className="text-xs text-slate-400 max-w-xs">Klik salah satu nama kandidat di sebelah kiri untuk mengisi hasil wawancara.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {selectedCand.is_blacklisted && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900"><strong>⚠️ Kandidat masuk daftar blacklist.</strong><p className="mt-1 whitespace-pre-wrap">{selectedCand.blacklist_reason}</p></div>}
              <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{selectedCand.nama}</h2>
                  <p className="text-xs text-slate-500">Gender: {selectedCand.gender}</p>
                </div>
                <a href={selectedCand.link_cv} target="_blank" rel="noreferrer" className="rnt-primary-action px-3 py-1.5 rounded-lg text-xs font-bold transition">
                  Buka Thread CV ↗
                </a>
              </div>

              {/* RIWAYAT AUDIT LOG MULTI-STAFF */}
              <CandidateLogs candidateId={selectedCand.id} reviewerNames={selectedCand.officer_reviewer} />

              {/* PREFERENSI DEPARTEMEN KANDIDAT */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Minat departemen kandidat <span className="font-normal text-slate-400">(opsional)</span></label>
                <p className="mb-2 text-[10px] leading-relaxed text-slate-500">Catat pilihan kandidat sebagai referensi minat. Pilihan ini tidak menetapkan departemen final.</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    aria-pressed={form.deptPreference === 'LSSD'}
                    onClick={() => updateAcademyTemplateData({ deptPreference: form.deptPreference === 'LSSD' ? '' : 'LSSD' })}
                    className={`interview-department-card flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      form.deptPreference === 'LSSD'
                        ? 'bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                    <Image src={LOGO_LSSD} alt="LSSD Logo" width={36} height={36} className="w-9 h-9 object-contain shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-indigo-950">LSSD</div>
                      <div className="text-[10px] text-slate-500">Sheriff&apos;s Department</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    aria-pressed={form.deptPreference === 'LSPD'}
                    onClick={() => updateAcademyTemplateData({ deptPreference: form.deptPreference === 'LSPD' ? '' : 'LSPD' })}
                    className={`interview-department-card flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      form.deptPreference === 'LSPD'
                        ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                    <Image src={LOGO_LSPD} alt="LSPD Logo" width={36} height={36} className="w-9 h-9 object-contain shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-blue-950">LSPD</div>
                      <div className="text-[10px] text-slate-500">Police Department</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-pressed={form.deptPreference === 'DOC'}
                    onClick={() => updateAcademyTemplateData({ deptPreference: form.deptPreference === 'DOC' ? '' : 'DOC' })}
                    className={`interview-department-card flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                      form.deptPreference === 'DOC'
                        ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-sm'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}>
                        <Image src={LOGO_DOC} alt="DOC Logo" width={36} height={36} className="w-9 h-9 object-contain shrink-0" />
                    <span><span className="block text-xs font-bold text-emerald-950">DOC</span><span className="block text-[10px] text-slate-500">Department of Corrections</span></span>
                  </button>
                </div>
                {form.deptPreference && <div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-500">Referensi minat tersimpan: {form.deptPreference}</span><button type="button" className="text-[10px] font-semibold text-slate-500 underline" onClick={() => updateAcademyTemplateData({ deptPreference: '' })}>Hapus preferensi</button></div>}
                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">Minat ini hanya bahan pertimbangan. Departemen final tetap dipilih admin atau Team RNT pada Manajemen.</div>
              </div>

              {/* HASIL WAWANCARA */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Hasil Wawancara *</label>
                <select 
                  className={`w-full border p-2.5 rounded-lg text-sm font-bold bg-white focus:outline-none focus:border-blue-500 shadow-sm ${
                    !form.statusInterview ? 'text-slate-500 border-slate-300' :
                    form.statusInterview === 'Passed' ? 'text-emerald-700 border-emerald-300' :
                    form.statusInterview === 'Pending' ? 'text-amber-700 border-amber-300' : 'text-rose-700 border-rose-300'
                  }`}
                  value={form.statusInterview} 
                  onChange={e => { updateAcademyTemplateData({ statusInterview: e.target.value }); setValidationError(''); }}>
                  <option value="" disabled>Pilih hasil wawancara</option>
                  <option value="Passed" className="text-emerald-700 bg-white font-bold py-1">🟢 Passed (Lulus interview)</option>
                  <option value="Pending" className="text-amber-700 bg-white font-bold py-1">🟡 Pending (Tunda Keputusan)</option>
                  <option value="Failed" className="text-rose-700 bg-white font-bold py-1">🔴 Failed (Tidak lulus interview)</option>
                </select>
                {validationError && <p className="mt-1 text-xs font-semibold text-rose-600" role="alert">{validationError}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama interviewer</label>
                <input
                  type="text"
                  maxLength={100}
                  className="w-full border border-slate-300 p-2.5 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-500"
                  placeholder="Kosongkan untuk memakai nama akun yang login"
                  value={form.interviewerName}
                  onChange={e => updateAcademyTemplateData({ interviewerName: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Officer Assist (Opsional)</label>
                <input 
                  type="text" 
                  className="w-full border border-slate-300 p-2.5 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-500" 
                  placeholder="Contoh: Lucas D Riverra" 
                  value={form.assistName} 
                  onChange={e => updateAcademyTemplateData({ assistName: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes Interviewer</label>
                <textarea 
                  rows="3" 
                  className="w-full border border-slate-300 p-2.5 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-500" 
                  value={form.notesInterviewer} 
                  onChange={e => setForm({...form, notesInterviewer: e.target.value})} 
                  placeholder="Catatan sikap, jawaban, atau jalannya wawancara..."></textarea>
              </div>

              <button 
                disabled={loading} 
                type="submit" 
                className="rnt-primary-action w-full py-3 rounded-lg font-bold text-sm transition shadow-md">
                {loading ? 'Menyimpan...' : 'Simpan Hasil Wawancara'}
              </button>

              <section className="academy-template-card" aria-labelledby="interview-academy-template-title">
                <div className="academy-template-heading">
                  <div>
                    <span className="academy-template-kicker">RECRUITMENT &amp; TRAINING</span>
                    <h3 id="interview-academy-template-title">{form.statusInterview === 'Failed' ? 'Template balasan Declined' : 'Template balasan Academy'}</h3>
                    <p>{form.statusInterview === 'Failed' ? 'Pilih alasan penolakan. BBCode akan diperbarui otomatis untuk kandidat ini.' : 'Tanggal dan waktu mengikuti jadwal batch aktif. Signature mengikuti profil petugas yang login.'}</p>
                  </div>
                  <span className={form.statusInterview === 'Failed' ? 'rejected-template-badge' : `academy-passed-badge ${academyPassed ? '' : 'is-unavailable'}`}>
                    {form.statusInterview === 'Failed' ? 'DECLINED' : academyPassed ? 'PASSED' : 'MENUNGGU DISIMPAN'}
                  </span>
                </div>

                {academyPassed ? <>
                  <div className="academy-details-grid academy-schedule-grid">
                    <div className="academy-schedule-item"><span>Tanggal</span><strong>{academySchedule.date}</strong></div>
                    <div className="academy-schedule-item"><span>Waktu · WIB</span><strong>{academySchedule.time}</strong></div>
                  </div>
                  <label className="academy-preview-label" htmlFor="interview-academy-bbcode">Pratinjau BBCode</label>
                  <textarea ref={academyPreviewRef} id="interview-academy-bbcode" className="academy-bbcode-preview" rows="10" readOnly value={academyBbcode} />
                  <div className="academy-template-actions">
                    <span role="status" aria-live="polite">{academyMessage || (!academyStaffReady ? 'Memuat profil petugas yang login…' : academySchedule.available ? 'Kode tersusun otomatis dari kandidat, jadwal batch, dan profil petugas.' : 'Jadwal Academy batch ini belum tersedia.')}</span>
                    <button type="button" onClick={copyAcademyBbcode} disabled={!academySchedule.available || !academyPassed || !academyStaffReady}>
                      {academyMessage === 'Template Academy berhasil disalin.' ? 'Tersalin ✓' : 'Salin Kode (Copy BBCode)'}
                    </button>
                  </div>
                </> : form.statusInterview === 'Failed' ? <>
                  <label className="academy-preview-label" htmlFor="interview-declined-reason">Reason Declined</label>
                  <select
                    id="interview-declined-reason"
                    className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                    value={DECLINED_REASON_OPTIONS.find((option) => option.text === declinedReason)?.label || ''}
                    onChange={(event) => {
                      const selectedReason = DECLINED_REASON_OPTIONS.find((option) => option.label === event.target.value);
                      setDeclinedReason(selectedReason?.text || '');
                      setAcademyMessage('');
                    }}
                  >
                    <option value="">Pilih alasan penolakan</option>
                    {DECLINED_REASON_OPTIONS.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
                  </select>
                  {declinedReason ? <>
                    <label className="academy-preview-label" htmlFor="interview-academy-bbcode">Pratinjau BBCode</label>
                    <textarea ref={academyPreviewRef} id="interview-academy-bbcode" className="academy-bbcode-preview" rows="12" readOnly value={declinedBbcode} />
                    <div className="academy-template-actions">
                      <span role="status" aria-live="polite">{academyMessage || 'Nama kandidat, alasan, dan signature petugas dimasukkan otomatis.'}</span>
                      <button type="button" onClick={copyAcademyBbcode} disabled={!academyStaffReady || !declinedBbcode}>
                        {academyMessage === 'Template Declined berhasil disalin.' ? 'Tersalin ✓' : 'Salin Kode (Copy BBCode)'}
                      </button>
                    </div>
                  </> : <div className="academy-template-unavailable">Pilih alasan Declined untuk menampilkan template BBCode.</div>}
                </> : (
                  <div className="academy-template-unavailable">Simpan hasil wawancara dengan status Passed terlebih dahulu untuk membuat template balasan.</div>
                )}
              </section>
            </form>
          )}
        </div>

      </div>

    </div>
  );
}

