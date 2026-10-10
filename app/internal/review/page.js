'use client';
import { useState, useEffect } from 'react';
import CandidateLogs from '../components/CandidateLogs';
import Pagination, { PAGE_SIZE } from '../components/Pagination';

const PENDING_REASON_OPTIONS = [
  {
    id: 'question-one-word-count',
    label: 'Question 1, Why do you want to apply as a police officer did not achieve the minimum target (100 words).',
  },
  {
    id: 'question-two-word-count',
    label: 'Question 2, Why should we accept you as a police officer did not achieve the minimum target (100 words).',
  },
  {
    id: 'criminal-record-expungement',
    label: 'HAVING A CRIMINAL RECORD NEEDS TO DO EXPUNGEMENT AT THE DEPARTMENT OF JUSTICE',
  },
];

const DEFAULT_INTERVIEW_DETAILS = {
  date: '19/10/2026 - 21/10/2026',
  time: '10:00 AM GMT +7 (WIB) - 23:59 PM GMT +7 (WIB)',
  location: 'ALTA POLICE STATION',
};

function createPendingBbcode(candidate, reasons, customReason, staffProfile) {
  const selectedReasons = [
    ...reasons.map((reasonId) => PENDING_REASON_OPTIONS.find((reason) => reason.id === reasonId)?.label).filter(Boolean),
    ...customReason.split('\n').map((reason) => reason.trim()).filter(Boolean),
  ];
  const salutation = candidate.gender === 'Female' ? 'Ms.' : 'Mr.';
  const reasonList = selectedReasons.map((reason) => `[*] ${reason}`).join('\n');
  const departmentName = staffProfile.department === 'LSSD'
    ? 'Los Santos Sheriff Department'
    : 'Los Santos Police Department';
  const signature = [
    staffProfile.name,
    staffProfile.rank,
    staffProfile.position,
    departmentName,
  ].filter(Boolean).join('\n');

  return `[divbox=white]
[center][img]https://imagizer.imageshack.com/v2/200x200q70/924/Rs1Hi8.png[/img][img]https://imagizer.imageshack.com/img924/9329/WjRSSl.png[/img][img]https://imageshack.com/i/pogQ42LOp[/img][/center]
[center][size=200][b]LAW ENFORCEMENT OFFICER[/b][/size][/center]
[center][size=100][b]Recruitment and Training Division[/b][/size][/center]
[divbox=darkblue][/divbox]
Dear ${salutation} ${candidate.nama},

Thank you for submitting your form to the Law Enforcement Officer. After an initial review, we would like to inform you that your application is currently [b][color=#FF8000]PENDING[/color][/b] due to the following reasons:

[list]
${reasonList || '[*] [Select at least one reason above.]'}
[/list]

There are certain details or requirements that must be completed or corrected before we can proceed with further processing. Please review your submission carefully, read the following reasons and ensure all required information is accurate and complete.

You may revise your application by using the Edit feature on your original post. Once the necessary changes have been made, please notify us by replying to your thread.

Thank you for your cooperation.

[right]Sincerely,
${signature || 'Recruitment Staff'}[/right]
[/divbox]`;
}

function createRejectedBbcode(candidate, staffProfile) {
  const salutation = candidate.gender === 'Female' ? 'Ms.' : 'Mr.';
  const departmentName = staffProfile.department === 'LSSD'
    ? 'Los Santos Sheriff Department'
    : 'Los Santos Police Department';
  const signature = [
    staffProfile.name,
    staffProfile.rank,
    staffProfile.position,
    departmentName,
  ].filter(Boolean).join('\n');

  return `[divbox=white]
[center][img]https://imagizer.imageshack.com/v2/200x200q70/924/Rs1Hi8.png[/img][img]https://imagizer.imageshack.com/img924/9329/WjRSSl.png[/img][img]https://imageshack.com/i/pogQ42LOp[/img][/center]
[center][size=200][b]LAW ENFORCEMENT OFFICER[/b][/size][/center]
[center][size=100][b]Recruitment and Training Division[/b][/size][/center]
[divbox=darkblue][/divbox]
Dear ${salutation} ${candidate.nama},

Thank you for taking the time to submit your application to the Law Enforcement Officer. After careful review, we regret to inform you that your application has been [b][color=#FF0000]REJECTED[/color][/b].

Unfortunately, it did not meet one or more of the required criteria to proceed further in the recruitment process. This may include incomplete information, failure to meet the writing standards, or other eligibility concerns.

You are welcome to fix your pending application, once all necessary corrections or improvements have been made. We appreciate your interest in joining the department and encourage you to use this as a learning experience for future opportunities.

Should you have any questions regarding the reason for this decision, feel free to reach out to a member of the Recruitment Division for clarification.

[right]Sincerely,  
${signature || 'Recruitment Staff'}[/right]
[/divbox]`;
}

function createAcceptedBbcode(candidate, staffProfile, interviewDetails) {
  const salutation = candidate.gender === 'Female' ? 'Ms.' : 'Mr.';
  const departmentName = staffProfile.department === 'LSSD'
    ? 'Los Santos Sheriff Department'
    : 'Los Santos Police Department';
  const signature = [
    staffProfile.name,
    staffProfile.rank,
    staffProfile.position,
    departmentName,
  ].filter(Boolean).join('\n');

  return `[divbox=white]
[center][img]https://imagizer.imageshack.com/v2/200x200q70/924/Rs1Hi8.png[/img][img]https://imagizer.imageshack.com/img924/9329/WjRSSl.png[/img][img]https://imageshack.com/i/pogQ42LOp[/img][/center]
[center][size=200][b]LAW ENFORCEMENT OFFICER[/b][/size][/center]
[center][size=100][b]Recruitment and Training Division[/b][/size][/center]
[divbox=darkblue][/divbox]
Dear ${salutation} ${candidate.nama},

We are pleased to inform you that your submitted form has been carefully reviewed and is now [b][color=#00BF00]ACCEPTED[/color][/b] by the Law Enforcement Officer. Your application met all the necessary requirements and has demonstrated your potential to move forward in the recruitment process.

As the next step, you are required to attend an in-person interview with one of our Recruitment Officers. This interview is a mandatory part of the selection process and will help us assess your qualifications, motivation, and suitability for service in the department.

Please find the details of your scheduled interview below:

📅 Date: ${interviewDetails.date}
⏰ Time: ${interviewDetails.time}
📍 Location: ${interviewDetails.location}

You are expected to arrive on time and be properly dressed in [b]professional or semi-formal attire[/b]. Failure to attend the interview or to arrive on time without prior notice may result in the termination of your application.

Should you have any questions or need to reschedule, please contact a member of the Recruitment Division or leave a message under your application thread.

We appreciate your interest in serving the city of Los Santos and look forward to meeting you in person.

[right]Sincerely,  
${signature || 'Recruitment Staff'}[/right]
[/divbox]`;
}

export default function ReviewPage() {
  const [candidates, setCandidates] = useState([]);
  const [viewMode, setViewMode] = useState('NEW'); // 'NEW', 'PENDING', atau 'INTERVIEW'
  const [selectedId, setSelectedId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ 
    statusCv: '', 
    mdtCheck: '', 
    catatan: '', 
    saran: '', 
    notesInvestigator: '' 
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [validationError, setValidationError] = useState('');
  const [pendingReasonsByCandidate, setPendingReasonsByCandidate] = useState({});
  const [customPendingReasonByCandidate, setCustomPendingReasonByCandidate] = useState({});
  const [interviewDetailsByCandidate, setInterviewDetailsByCandidate] = useState({});
  const [staffProfile, setStaffProfile] = useState({ name: '', rank: '', position: '', department: '' });
  const [copyMessage, setCopyMessage] = useState('');

  useEffect(() => {
    fetch('/api/internal/session')
      .then((response) => response.json())
      .then((data) => {
        if (data.authenticated) {
          setStaffProfile({
            name: data.officerName || '',
            rank: data.officerRank || '',
            position: data.officerPosition || '',
            department: data.officerDepartment || '',
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/candidates')
      .then((response) => response.json())
      .then((data) => {
        if (!active || !data.success) return;
        setCandidates(data.data.filter((candidate) =>
          !['Accepted', 'Rejected'].includes(candidate.status_cv) && !candidate.status_interview
        ));
      });
    return () => { active = false; };
  }, []);

  const fetchData = async () => {
    const res = await fetch('/api/candidates');
    const data = await res.json();
    if (data.success) {
      const activeCandidates = data.data.filter(
        c => !['Accepted', 'Rejected'].includes(c.status_cv) && !c.status_interview
      );
      setCandidates(activeCandidates);
      setCurrentPage(1);
    }
  };

  const displayedCandidates = candidates.filter(c => {
    const matchSearch = c.nama.toLowerCase().includes(search.toLowerCase());
    let matchMode = false;
    if (viewMode === 'NEW') matchMode = !c.status_cv || c.status_cv === '';
    else if (viewMode === 'PENDING') matchMode = c.status_cv === 'Pending';
    else if (viewMode === 'INTERVIEW') matchMode = c.status_cv === 'Interview';

    return matchMode && matchSearch;
  });
  const paginatedCandidates = displayedCandidates.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, viewMode]);

  const handleSelect = (cand) => {
    setSelectedId(cand.id);
    setValidationError('');
    setCopyMessage('');
    setForm({ 
      statusCv: cand.status_cv || '', 
      mdtCheck: cand.mdt_check || '', 
      catatan: cand.catatan || '', 
      saran: cand.saran || '', 
      notesInvestigator: cand.notes_investigator || '' 
    });
  };

  const isCvNoteRequired = form.statusCv === 'Pending' || form.statusCv === 'Rejected';
  const isMdtNoteRequired = form.mdtCheck === 'Yellow' || form.mdtCheck === 'Red';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedId) return;
    setValidationError('');

    const missingFields = [];
    if (!form.statusCv) missingFields.push('Status CV');
    if (!form.mdtCheck) missingFields.push('MDT Check');
    if (form.statusCv === 'Pending' && !hasPendingReasons) missingFields.push('minimal satu alasan untuk template Pending');
    if (isCvNoteRequired && !form.catatan.trim()) {
      missingFields.push(`Catatan Evaluator (karena Status CV = [${form.statusCv}])`);
    }
    if (isMdtNoteRequired && !form.notesInvestigator.trim()) {
      missingFields.push(`Notes from Investigator (karena MDT Check = [${form.mdtCheck}])`);
    }

    if (missingFields.length > 0) {
      setValidationError(`Pengisian Wajib: ${missingFields.join(' dan ')} wajib diisi.`);
      return;
    }

    setLoading(true);
    
    const res = await fetch('/api/candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'UPDATE_EVALUATION', 
        id: selectedId, 
        ...form 
      })
    });
    
    const data = await res.json();
    setLoading(false);
    
    if (data.success) {
      setMsg('Evaluasi CV berhasil disimpan!');
      setSelectedId('');
      fetchData();
      setTimeout(() => setMsg(''), 3000);
    }
  };

  const selectedCand = candidates.find(c => c.id === selectedId);
  const selectedPendingReasons = selectedCand ? pendingReasonsByCandidate[selectedCand.id] || [] : [];
  const selectedCustomPendingReason = selectedCand ? customPendingReasonByCandidate[selectedCand.id] || '' : '';
  const pendingBbcode = selectedCand && form.statusCv === 'Pending'
    ? createPendingBbcode(selectedCand, selectedPendingReasons, selectedCustomPendingReason, staffProfile)
    : '';
  const rejectedBbcode = selectedCand && form.statusCv === 'Rejected'
    ? createRejectedBbcode(selectedCand, staffProfile)
    : '';
  const selectedInterviewDetails = selectedCand
    ? { ...DEFAULT_INTERVIEW_DETAILS, ...interviewDetailsByCandidate[selectedCand.id] }
    : DEFAULT_INTERVIEW_DETAILS;
  const acceptedBbcode = selectedCand && form.statusCv === 'Interview'
    ? createAcceptedBbcode(selectedCand, staffProfile, selectedInterviewDetails)
    : '';
  const hasPendingReasons = selectedPendingReasons.length > 0 || selectedCustomPendingReason.split('\n').some((reason) => reason.trim());

  const togglePendingReason = (reasonId) => {
    if (!selectedCand) return;
    setPendingReasonsByCandidate((current) => {
      const selected = current[selectedCand.id] || [];
      const next = selected.includes(reasonId)
        ? selected.filter((id) => id !== reasonId)
        : [...selected, reasonId];
      return { ...current, [selectedCand.id]: next };
    });
    setValidationError('');
    setCopyMessage('');
  };

  const copyBbcode = async (bbcode, successMessage) => {
    try {
      await navigator.clipboard.writeText(bbcode);
      setCopyMessage(successMessage);
    } catch {
      setCopyMessage('Clipboard tidak tersedia. Salin teks dari kotak BBCode secara manual.');
    }
  };

  const copyPendingBbcode = () => copyBbcode(pendingBbcode, 'BBCode Pending berhasil disalin.');
  const copyRejectedBbcode = () => copyBbcode(rejectedBbcode, 'BBCode Rejected berhasil disalin.');
  const copyAcceptedBbcode = () => copyBbcode(acceptedBbcode, 'BBCode Accepted berhasil disalin.');

  const countNew = candidates.filter(c => !c.status_cv || c.status_cv === '').length;
  const countPending = candidates.filter(c => c.status_cv === 'Pending').length;
  const countInterview = candidates.filter(c => c.status_cv === 'Interview').length;

  return (
    <div className="review-page space-y-4">
      {/* HEADER & TAB NAVIGATION */}
      <div className="flex justify-between items-center bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Penilaian & Seleksi CV</h1>
          <p className="text-xs text-slate-500">Pemetaan Departemen dilakukan nanti pada sesi Interview.</p>
        </div>

        <div className="flex bg-slate-200/80 p-1.5 rounded-xl gap-1.5 border border-slate-300/60">
          <button 
            type="button"
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition-all ${
              viewMode === 'NEW' 
                ? 'bg-white text-blue-700 shadow-md shadow-slate-200 ring-1 ring-black/5' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/50'
            }`}
            onClick={() => { setViewMode('NEW'); setSelectedId(''); setValidationError(''); }}>
            <span>Antrean Baru</span>
            <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full ${
              viewMode === 'NEW' ? 'bg-blue-100 text-blue-800' : 'bg-slate-300 text-slate-700'
            }`}>
              {countNew}
            </span>
          </button>

          <button 
            type="button"
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition-all ${
              viewMode === 'PENDING' 
                ? 'bg-white text-amber-700 shadow-md shadow-slate-200 ring-1 ring-black/5' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/50'
            }`}
            onClick={() => { setViewMode('PENDING'); setSelectedId(''); setValidationError(''); }}>
            <span>Pending</span>
            <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full ${
              viewMode === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-slate-300 text-slate-700'
            }`}>
              {countPending}
            </span>
          </button>

          <button 
            type="button"
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition-all ${
              viewMode === 'INTERVIEW' 
                ? 'bg-white text-emerald-700 shadow-md shadow-slate-200 ring-1 ring-black/5' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/50'
            }`}
            onClick={() => { setViewMode('INTERVIEW'); setSelectedId(''); setValidationError(''); }}>
            <span>Status Interview</span>
            <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full ${
              viewMode === 'INTERVIEW' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-300 text-slate-700'
            }`}>
              {countInterview}
            </span>
          </button>
        </div>
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
          <div className="font-bold text-xs text-slate-600 uppercase tracking-wider border-b border-slate-100 pb-2">
            Daftar {viewMode === 'NEW' ? 'Antrean Baru' : viewMode === 'PENDING' ? 'Status Pending' : 'Status Interview'} ({displayedCandidates.length})
          </div>

          <input 
            type="text" 
            placeholder="Cari nama..." 
            className="w-full border border-slate-300 p-2 rounded-lg text-xs text-slate-900 bg-white focus:outline-none focus:border-blue-500" 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
          />

          <div className="max-h-[500px] overflow-y-auto space-y-2 pr-1">
            {displayedCandidates.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">Tidak ada data.</div>
            ) : (
              paginatedCandidates.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className={`w-full text-left p-3 rounded-xl border transition flex flex-col gap-1 ${
                    c.id === selectedId ? 'bg-blue-50/80 border-blue-500 shadow-sm' : 'bg-slate-50/50 border-slate-200 hover:bg-slate-100/80'
                  }`}>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-slate-800 truncate">{c.nama}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      c.status_cv === 'Interview' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 
                      c.status_cv === 'Pending' ? 'bg-amber-100 text-amber-800 border border-amber-300' : 
                      c.status_cv === 'Rejected' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                      'bg-blue-100 text-blue-800 border border-blue-300'
                    }`}>
                      {c.status_cv || 'Baru'}
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
              <p className="text-xs text-slate-400 max-w-xs">Klik salah satu nama kandidat pada panel antrean di sebelah kiri.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{selectedCand.nama}</h2>
                  <p className="text-xs text-slate-500">Gender: {selectedCand.gender}</p>
                </div>
                <a href={selectedCand.link_cv} target="_blank" rel="noreferrer" className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 transition">
                  Buka Thread CV ↗
                </a>
              </div>

              {/* RIWAYAT AUDIT LOG MULTI-STAFF */}
              <CandidateLogs candidateId={selectedCand.id} reviewerNames={selectedCand.officer_reviewer} />

              {validationError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-lg">
                  ⚠️ {validationError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {/* STATUS CV DROPDOWN */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Status CV *</label>
                  <select 
                    className={`w-full border p-2.5 rounded-lg text-sm font-bold bg-white focus:outline-none focus:border-blue-500 shadow-sm ${
                      !form.statusCv ? 'text-slate-500 border-slate-300' :
                      form.statusCv === 'Interview' ? 'text-emerald-700 border-emerald-300' :
                      form.statusCv === 'Pending' ? 'text-amber-700 border-amber-300' : 'text-rose-700 border-rose-300'
                    }`}
                    value={form.statusCv} 
                    onChange={e => { setForm({...form, statusCv: e.target.value}); setValidationError(''); setCopyMessage(''); }}>
                    <option value="" disabled>Pilih status CV</option>
                    <option value="Interview" className="text-emerald-700 bg-white font-bold py-1">🔵 Lolos Review CV (lanjut Interview)</option>
                    <option value="Pending" className="text-amber-700 bg-white font-bold py-1">🟡 Pending (Tunda Penilaian)</option>
                    <option value="Rejected" className="text-rose-700 bg-white font-bold py-1">🔴 Rejected (Ditolak)</option>
                  </select>
                </div>

                {/* MDT CHECK DROPDOWN */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">MDT Check *</label>
                  <select 
                    className={`w-full border p-2.5 rounded-lg text-sm font-bold bg-white focus:outline-none focus:border-blue-500 shadow-sm ${
                      !form.mdtCheck ? 'text-slate-500 border-slate-300' :
                      form.mdtCheck === 'Green' ? 'text-emerald-700 border-emerald-300' :
                      form.mdtCheck === 'Yellow' ? 'text-amber-700 border-amber-300' : 'text-rose-700 border-rose-300'
                    }`}
                    value={form.mdtCheck} 
                    onChange={e => { setForm({...form, mdtCheck: e.target.value}); setValidationError(''); }}>
                    <option value="" disabled>Pilih hasil MDT</option>
                    <option value="Green" className="text-emerald-700 bg-white font-bold py-1">🟢 Green (Bersih)</option>
                    <option value="Yellow" className="text-amber-700 bg-white font-bold py-1">🟡 Yellow (Catatan Ringan)</option>
                    <option value="Red" className="text-rose-700 bg-white font-bold py-1">🔴 Red (Catatan Berat)</option>
                  </select>
                </div>
              </div>

              {form.statusCv === 'Pending' && (
                <section className="pending-template-card" aria-labelledby="pending-template-title">
                  <div className="pending-template-heading">
                    <div>
                      <h3 id="pending-template-title">Template balasan Pending</h3>
                      <p>Pilih alasan yang sesuai untuk kandidat ini. Template akan dirangkai otomatis dalam BBCode.</p>
                    </div>
                    <span className="pending-template-badge">PENDING</span>
                  </div>

                  <div className="pending-reason-list">
                    {PENDING_REASON_OPTIONS.map((reason) => (
                      <label key={reason.id} className="pending-reason-option">
                        <input
                          type="checkbox"
                          checked={selectedPendingReasons.includes(reason.id)}
                          onChange={() => togglePendingReason(reason.id)}
                        />
                        <span>{reason.label}</span>
                      </label>
                    ))}
                  </div>

                  <label className="pending-custom-reason-label" htmlFor="pending-custom-reason">Alasan khusus kandidat (opsional, satu alasan per baris)</label>
                  <textarea
                    id="pending-custom-reason"
                    rows="2"
                    value={selectedCustomPendingReason}
                    onChange={(event) => {
                      if (!selectedCand) return;
                      setCustomPendingReasonByCandidate((current) => ({ ...current, [selectedCand.id]: event.target.value }));
                      setValidationError('');
                      setCopyMessage('');
                    }}
                    placeholder="Tuliskan alasan spesifik lain untuk kandidat ini..."
                  />

                  <label className="pending-bbcode-label" htmlFor="pending-bbcode-preview">Pratinjau BBCode</label>
                  <textarea
                    id="pending-bbcode-preview"
                    className="pending-bbcode-preview"
                    rows="12"
                    readOnly
                    value={pendingBbcode}
                  />
                  <div className="pending-template-actions">
                    <span role="status" aria-live="polite">{copyMessage || (hasPendingReasons ? 'Nama kandidat dan staff dimasukkan otomatis.' : 'Pilih minimal satu alasan sebelum menyalin.')}</span>
                    <button type="button" onClick={copyPendingBbcode} disabled={!hasPendingReasons}>
                      {copyMessage === 'BBCode Pending berhasil disalin.' ? 'Tersalin ✓' : 'Salin BBCode'}
                    </button>
                  </div>
                </section>
              )}

              {form.statusCv === 'Interview' && (
                <section className="pending-template-card" aria-labelledby="accepted-template-title">
                  <div className="pending-template-heading">
                    <div>
                      <h3 id="accepted-template-title">Template balasan Accepted</h3>
                      <p>Surat lolos review CV untuk mengundang kandidat ke tahap wawancara. Jadwal dapat disesuaikan.</p>
                    </div>
                    <span className="accepted-template-badge">ACCEPTED</span>
                  </div>

                  <div className="accepted-interview-details">
                    <label>
                      <span>Tanggal wawancara</span>
                      <input
                        type="text"
                        value={selectedInterviewDetails.date}
                        onChange={(event) => {
                          setInterviewDetailsByCandidate((current) => ({
                            ...current,
                            [selectedCand.id]: { ...selectedInterviewDetails, date: event.target.value },
                          }));
                          setCopyMessage('');
                        }}
                        placeholder="Contoh: 19/10/2026 - 21/10/2026"
                      />
                    </label>
                    <label>
                      <span>Waktu wawancara</span>
                      <input
                        type="text"
                        value={selectedInterviewDetails.time}
                        onChange={(event) => {
                          setInterviewDetailsByCandidate((current) => ({
                            ...current,
                            [selectedCand.id]: { ...selectedInterviewDetails, time: event.target.value },
                          }));
                          setCopyMessage('');
                        }}
                        placeholder="Contoh: 10:00 AM - 11:00 AM WIB"
                      />
                    </label>
                    <label className="accepted-interview-location">
                      <span>Lokasi wawancara</span>
                      <input
                        type="text"
                        value={selectedInterviewDetails.location}
                        onChange={(event) => {
                          setInterviewDetailsByCandidate((current) => ({
                            ...current,
                            [selectedCand.id]: { ...selectedInterviewDetails, location: event.target.value },
                          }));
                          setCopyMessage('');
                        }}
                        placeholder="Contoh: ALTA POLICE STATION"
                      />
                    </label>
                  </div>

                  <label className="pending-bbcode-label" htmlFor="accepted-bbcode-preview">Pratinjau BBCode</label>
                  <textarea
                    id="accepted-bbcode-preview"
                    className="pending-bbcode-preview"
                    rows="12"
                    readOnly
                    value={acceptedBbcode}
                  />
                  <div className="pending-template-actions">
                    <span role="status" aria-live="polite">{copyMessage || 'Nama kandidat, jadwal, dan tanda tangan dimasukkan otomatis.'}</span>
                    <button type="button" onClick={copyAcceptedBbcode}>
                      {copyMessage === 'BBCode Accepted berhasil disalin.' ? 'Tersalin ✓' : 'Salin BBCode'}
                    </button>
                  </div>
                </section>
              )}

              {form.statusCv === 'Rejected' && (
                <section className="pending-template-card" aria-labelledby="rejected-template-title">
                  <div className="pending-template-heading">
                    <div>
                      <h3 id="rejected-template-title">Template balasan Rejected</h3>
                      <p>Pratinjau balasan resmi. Nama kandidat dan tanda tangan mengikuti data sesi yang sedang login.</p>
                    </div>
                    <span className="rejected-template-badge">REJECTED</span>
                  </div>
                  <label className="pending-bbcode-label" htmlFor="rejected-bbcode-preview">Pratinjau BBCode</label>
                  <textarea
                    id="rejected-bbcode-preview"
                    className="pending-bbcode-preview"
                    rows="12"
                    readOnly
                    value={rejectedBbcode}
                  />
                  <div className="pending-template-actions">
                    <span role="status" aria-live="polite">{copyMessage || 'Template siap disalin.'}</span>
                    <button type="button" onClick={copyRejectedBbcode}>
                      {copyMessage === 'BBCode Rejected berhasil disalin.' ? 'Tersalin ✓' : 'Salin BBCode'}
                    </button>
                  </div>
                </section>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Catatan Evaluator {isCvNoteRequired && <span className="text-rose-500">* (Wajib diisi)</span>}
                </label>
                <textarea 
                  rows="2" 
                  className={`w-full border p-2.5 rounded-lg text-sm text-slate-900 bg-white focus:outline-none ${
                    isCvNoteRequired && !form.catatan.trim() ? 'border-rose-300 bg-rose-50/30' : 'border-slate-300'
                  }`}
                  value={form.catatan} 
                  onChange={e => { setForm({...form, catatan: e.target.value}); setValidationError(''); }} 
                  placeholder={isCvNoteRequired ? `Jelaskan alasan menetapkan Status CV ke ${form.statusCv}...` : "Catatan internal hasil pengecekan..."}></textarea>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Saran / Feedback</label>
                <textarea 
                  rows="2" 
                  className="w-full border border-slate-300 p-2.5 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-500" 
                  value={form.saran} 
                  onChange={e => setForm({...form, saran: e.target.value})} 
                  placeholder="Saran untuk kandidat/interviewer..."></textarea>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Notes from Investigator {isMdtNoteRequired && <span className="text-rose-500">* (Wajib diisi)</span>}
                </label>
                <textarea 
                  rows="2" 
                  className={`w-full border p-2.5 rounded-lg text-sm text-slate-900 bg-white focus:outline-none ${
                    isMdtNoteRequired && !form.notesInvestigator.trim() ? 'border-rose-300 bg-rose-50/30' : 'border-slate-300'
                  }`}
                  value={form.notesInvestigator} 
                  onChange={e => { setForm({...form, notesInvestigator: e.target.value}); setValidationError(''); }} 
                  placeholder={isMdtNoteRequired ? `Jelaskan temuan kejahatan/rekam jejak terkait MDT Check ${form.mdtCheck}...` : "Hasil temuan investigasi jika ada..."}></textarea>
              </div>

              <button 
                disabled={loading} 
                type="submit" 
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold text-sm hover:bg-blue-700 disabled:bg-slate-300 transition shadow-md shadow-blue-500/20">
                {loading ? 'Menyimpan...' : 'Simpan Evaluasi CV'}
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}
