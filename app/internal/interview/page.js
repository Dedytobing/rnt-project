'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import CandidateLogs from '../components/CandidateLogs';
import Pagination, { PAGE_SIZE } from '../components/Pagination';

const LOGO_LSSD = '/logos/lssd.png';
const LOGO_LSPD = '/logos/lspd.png';

export default function InterviewPage() {
  const [candidates, setCandidates] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ 
    deptPreference: '',
    assistName: '', 
    statusInterview: '', 
    notesInterviewer: '' 
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [validationError, setValidationError] = useState('');

  const fetchData = async () => {
    const res = await fetch('/api/candidates');
    const data = await res.json();
    if (data.success) {
      setCandidates(data.data.filter(c => c.status_cv === 'Interview' && (!c.status_interview || c.status_interview === 'Pending')));
      setCurrentPage(1);
    }
  };

  useEffect(() => {
    let active = true;
    fetch('/api/candidates')
      .then((response) => response.json())
      .then((data) => {
        if (active && data.success) setCandidates(data.data.filter((candidate) =>
          candidate.status_cv === 'Interview' && (!candidate.status_interview || candidate.status_interview === 'Pending')
        ));
      });
    return () => { active = false; };
  }, []);

  const displayedCandidates = candidates.filter(c =>
    c.nama.toLowerCase().includes(search.toLowerCase())
  );
  const paginatedCandidates = displayedCandidates.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const handleSelect = (cand) => {
    setSelectedId(cand.id);
    setForm({
      deptPreference: cand.dept_preference || '',
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
    
    const res = await fetch('/api/candidates', {
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
      setMsg(data.message);
      setSelectedId('');
      fetchData();
      setTimeout(() => setMsg(''), 3000);
    }
  };

  const selectedCand = candidates.find(c => c.id === selectedId);

  return (
    <div className="space-y-4">
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

          <input 
            type="text" 
            placeholder="Cari nama kandidat..." 
            className="w-full border border-slate-300 p-2 rounded-lg text-xs text-slate-900 bg-white focus:outline-none focus:border-blue-500" 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
          />

          <div className="max-h-[500px] overflow-y-auto space-y-2 pr-1">
            {displayedCandidates.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">Tidak ada kandidat siap interview.</div>
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
                    <span className="font-bold text-xs text-slate-800 truncate">{c.nama}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                      Ready
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

              {/* PREFERENSI DEPARTEMEN KANDIDAT */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Minat departemen kandidat <span className="font-normal text-slate-400">(opsional)</span></label>
                <p className="mb-2 text-[10px] leading-relaxed text-slate-500">Pilihan ini hanya mencatat preferensi kandidat dan tidak menetapkan penempatan akhir.</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    aria-pressed={form.deptPreference === 'LSSD'}
                    onClick={() => setForm({...form, deptPreference: form.deptPreference === 'LSSD' ? '' : 'LSSD'})}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      form.deptPreference === 'LSSD'
                        ? 'bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                    <Image src={LOGO_LSSD} alt="LSSD Logo" width={36} height={36} className="w-9 h-9 object-contain shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-indigo-950">LSSD</div>
                      <div className="text-[10px] text-slate-500">Minat Sheriff&apos;s Department</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    aria-pressed={form.deptPreference === 'LSPD'}
                    onClick={() => setForm({...form, deptPreference: form.deptPreference === 'LSPD' ? '' : 'LSPD'})}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      form.deptPreference === 'LSPD'
                        ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                    <Image src={LOGO_LSPD} alt="LSPD Logo" width={36} height={36} className="w-9 h-9 object-contain shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-blue-950">LSPD</div>
                      <div className="text-[10px] text-slate-500">Minat Police Department</div>
                    </div>
                  </button>
                </div>
                {form.deptPreference && <button type="button" className="mt-2 text-[10px] font-semibold text-slate-500 underline" onClick={() => setForm({...form, deptPreference: ''})}>Hapus preferensi</button>}
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">Penempatan final LSSD / LSPD hanya dapat ditetapkan oleh Team RED.</div>
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
                  onChange={e => { setForm({...form, statusInterview: e.target.value}); setValidationError(''); }}>
                  <option value="" disabled>Pilih hasil wawancara</option>
                  <option value="Passed" className="text-emerald-700 bg-white font-bold py-1">🟢 Passed (Lulus interview)</option>
                  <option value="Pending" className="text-amber-700 bg-white font-bold py-1">🟡 Pending (Tunda Keputusan)</option>
                  <option value="Failed" className="text-rose-700 bg-white font-bold py-1">🔴 Failed (Tidak lulus interview)</option>
                </select>
                {validationError && <p className="mt-1 text-xs font-semibold text-rose-600" role="alert">{validationError}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Officer Assist (Opsional)</label>
                <input 
                  type="text" 
                  className="w-full border border-slate-300 p-2.5 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-500" 
                  placeholder="Contoh: Lucas D Riverra" 
                  value={form.assistName} 
                  onChange={e => setForm({...form, assistName: e.target.value})} 
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
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold text-sm hover:bg-blue-700 disabled:bg-slate-300 transition shadow-md shadow-blue-500/20">
                {loading ? 'Menyimpan...' : 'Simpan Hasil Wawancara'}
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}
