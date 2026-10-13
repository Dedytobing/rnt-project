'use client';
import { useState, useEffect, useContext } from 'react';
import { 
  Chart as ChartJS, 
  ArcElement, 
  Tooltip, 
  Legend, 
  CategoryScale, 
  LinearScale, 
  BarElement 
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import Pagination, { PAGE_SIZE } from '../components/Pagination';
import { BatchContext, candidatesUrl } from '../BatchContext';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const departmentLogos = { LSSD: '/logos/lssd.png', LSPD: '/logos/lspd.png' };
function departmentBadgeClass(department) {
  if (department === 'LSSD') return 'department-badge department-badge-lssd';
  if (department === 'LSPD') return 'department-badge department-badge-lspd';
  if (department === 'DOC') return 'department-badge department-badge-doc';
  return 'department-badge department-badge-unset';
}

function normalizeMdtStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'green') return 'Green';
  if (status === 'red' || status.includes('black') || status.includes('penalty') || status.includes('penalti')) return 'Red';
  if (status === 'yellow' || status === 'orange') return 'Orange';
  return status ? 'Orange' : '';
}

function displayStaffFirstNames(value) {
  return String(value || '')
    .split(/\s*[,;|]\s*/)
    .map((name) => name.trim().split(/\s+/)[0])
    .filter(Boolean)
    .map((name) => `${name.charAt(0).toLocaleUpperCase('id-ID')}${name.slice(1).toLocaleLowerCase('id-ID')}`)
    .join(', ') || '—';
}

const recruitmentStages = [
  { id: 'new', label: 'Data Baru', color: '#3B82F6' },
  { id: 'pending', label: 'Pending', color: '#F59E0B' },
  { id: 'interview', label: 'Proses Interview', color: '#8B5CF6' },
  { id: 'passed', label: 'Passed / Accepted', color: '#10B981' },
  { id: 'rejected', label: 'Ditolak', color: '#EF4444' },
  { id: 'verify', label: 'Perlu Verifikasi', color: '#64748B' },
];

function getRecruitmentStage(candidate) {
  if (candidate.status_interview === 'Passed') return 'passed';
  if (candidate.status_interview === 'Failed' || candidate.status_cv === 'Rejected') return 'rejected';
  if (candidate.status_cv === 'Pending' || candidate.status_interview === 'Pending') return 'pending';
  if (candidate.status_cv === 'Interview') return 'interview';
  if (!candidate.status_cv) return 'new';
  return 'verify';
}

const departmentLogoCache = {};
function getDepartmentLogo(src, chart) {
  if (!departmentLogoCache[src]) {
    const image = new Image();
    image.onload = () => chart.draw();
    image.src = src;
    departmentLogoCache[src] = image;
  }
  return departmentLogoCache[src];
}

const departmentLogoPlugin = {
  id: 'departmentLogoPlugin',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.getDatasetMeta(0).data.forEach((bar, index) => {
      const src = departmentLogos[chart.data.labels[index]];
      if (!src) return;
      const image = getDepartmentLogo(src, chart);
      if (!image.complete || !image.naturalWidth) return;
      const size = 21;
      const x = Math.min(bar.x + 4, chart.width - size - 2);
      const y = bar.y - size / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2 + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.drawImage(image, x, y, size, size);
      ctx.restore();
    });
  },
};

export default function InternalDashboard() {
  const { selectedBatch } = useContext(BatchContext);
  const [candidates, setCandidates] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterInterview, setFilterInterview] = useState('ALL');
  const [filterMdt, setFilterMdt] = useState('ALL');
  const [filterDept, setFilterDept] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [detailCandidate, setDetailCandidate] = useState(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    fetch(candidatesUrl(selectedBatch?.id))
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Data kandidat gagal dimuat.');
        }
        setCandidates(result.data || []);
      })
      .catch(error => setLoadError(error.message || 'Data kandidat gagal dimuat.'))
      .finally(() => setLoading(false));
  }, [selectedBatch?.id]);

  // Reset ke halaman 1 setiap kali filter atau kata kunci berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterStatus, filterInterview, filterMdt, filterDept]);

  useEffect(() => {
    if (!detailCandidate) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setDetailCandidate(null); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [detailCandidate]);

  // Pengecekan apakah ada filter aktif
  const isFilterActive = 
    search.trim() !== '' || 
    filterStatus !== 'ALL' ||
    filterInterview !== 'ALL' ||
    filterMdt !== 'ALL' || 
    filterDept !== 'ALL';

  // 1. Filtering Data
  const rawFilteredData = candidates.filter(c => {
    const matchSearch = c.nama.toLowerCase().includes(search.toLowerCase());
    
    const statusCv = c.status_cv || 'NEW';
    const matchStatus = 
      filterStatus === 'ALL' ? true :
      filterStatus === 'NEW' ? (!c.status_cv || c.status_cv === '') :
      statusCv === filterStatus;

    const matchInterview = filterInterview === 'ALL' ? true :
      filterInterview === 'NO_RESULT'
        ? c.status_cv === 'Interview' && !c.status_interview
        : c.status_interview === filterInterview;

    const matchMdt = filterMdt === 'ALL' ? true : (normalizeMdtStatus(c.mdt_check) === filterMdt);
    const matchDept = filterDept === 'ALL' ? true : (c.mapping_dept === filterDept);

    return matchSearch && matchStatus && matchInterview && matchMdt && matchDept;
  });

  // 2. Sorting Data:
  // - Jika Filter Aktif -> Urutkan berdasarkan Abjad Nama (A - Z)
  // - Jika ALL Data (Tanpa Filter) -> Urutkan berdasarkan Data Terbaru / Terakhir Diupdate
  const sortedCandidates = [...rawFilteredData].sort((a, b) => {
    if (isFilterActive) {
      return a.nama.localeCompare(b.nama);
    } else {
      const dateA = new Date(a.updated_at || a.created_at || 0);
      const dateB = new Date(b.updated_at || b.created_at || 0);
      return dateB - dateA; // Descending (terbaru di atas)
    }
  });

  // 3. Slice Data untuk Pagination (10 item per halaman)
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedCandidates = sortedCandidates.slice(startIndex, startIndex + PAGE_SIZE);

  // Hitung statistik untuk cards & chart
  const total = candidates.length;
  const countNew = candidates.filter(c => !c.status_cv || c.status_cv === '').length;
  const countPending = candidates.filter(c => c.status_cv === 'Pending').length;
  const countInterviewWaiting = candidates.filter(c => c.status_cv === 'Interview' && !c.status_interview).length;
  const countInterviewPending = candidates.filter(c => c.status_interview === 'Pending').length;
  const countInterviewPassed = candidates.filter(c => c.status_interview === 'Passed').length;
  const countNeedsCvReview = countNew + countPending;
  const countNeedsInterview = countInterviewWaiting + countInterviewPending;

  const countLssd = candidates.filter(c => c.mapping_dept === 'LSSD').length;
  const countLspd = candidates.filter(c => c.mapping_dept === 'LSPD').length;
  const countPlaced = countLssd + countLspd;
  const countPassedAwaitingPlacement = Math.max(0, countInterviewPassed - countPlaced);
  const recruitmentStageCounts = recruitmentStages.map(stage =>
    candidates.filter(candidate => getRecruitmentStage(candidate) === stage.id).length
  );
  const visibleRecruitmentStages = recruitmentStages
    .map((stage, index) => ({ ...stage, count: recruitmentStageCounts[index] }))
    .filter(stage => stage.count > 0);
  const detailNotes = detailCandidate ? [
    ['Catatan CV', detailCandidate.catatan],
    ['Saran evaluator', detailCandidate.saran],
    ['Catatan investigator', detailCandidate.notes_investigator],
    ['Catatan interviewer', detailCandidate.notes_interviewer],
  ].filter(([, value]) => typeof value === 'string' && value.trim()) : [];

  return (
    <div className="dashboard-page space-y-6">
      {loadError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Data kandidat gagal dimuat: {loadError}. Muat ulang halaman setelah masuk kembali ke portal staff.
        </div>
      )}
      {/* RINGKASAN INTI */}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3" aria-label="Ringkasan rekrutmen">
        <div className="flex min-h-[106px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span aria-hidden="true" className="h-10 w-1 shrink-0 rounded-full bg-slate-400" />
          <div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Total Kandidat</div><div className="mt-1 text-2xl font-extrabold leading-none text-slate-800">{total}</div><div className="mt-1 text-[10px] text-slate-500">Semua pendaftaran</div></div>
        </div>
        <div className="flex min-h-[106px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span aria-hidden="true" className="h-10 w-1 shrink-0 rounded-full bg-blue-500" />
          <div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Perlu Review</div><div className="mt-1 text-2xl font-extrabold leading-none text-blue-700">{countNeedsCvReview}</div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]"><span className="font-semibold text-blue-700">Data Baru <b>{countNew}</b></span><span className="font-semibold text-amber-700">Pending (revisi) <b>{countPending}</b></span></div>
          </div>
        </div>
        <div className="flex min-h-[106px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span aria-hidden="true" className="h-10 w-1 shrink-0 rounded-full bg-amber-500" />
          <div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Proses Interview</div><div className="mt-1 text-2xl font-extrabold leading-none text-amber-700">{countNeedsInterview}</div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]"><span className="font-semibold text-slate-600">Belum interview <b>{countInterviewWaiting}</b></span><span className="font-semibold text-amber-700">Pending <b>{countInterviewPending}</b></span></div>
          </div>
        </div>
        <div className="flex min-h-[106px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span aria-hidden="true" className="h-10 w-1 shrink-0 rounded-full bg-emerald-500" />
          <div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Diterima</div><div className="mt-1 text-2xl font-extrabold leading-none text-emerald-700">{countInterviewPassed}</div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]"><span className="font-semibold text-slate-600">Pembagian Department <b>{countPassedAwaitingPlacement}</b></span><span className="font-semibold  text-emerald-700">Sudah <b>{countPlaced}</b></span></div>
          </div>
        </div>
      </section>

      {/* GRAFIK VISUAL */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3"><h3 className="text-sm font-bold text-slate-800">Progress Rekrutmen Keseluruhan</h3><p className="text-[11px] text-slate-500">Tahap terakhir setiap kandidat · {total} kandidat</p></div>
          <div className="flex min-h-[170px] items-center justify-center gap-5 sm:gap-8">
            <div className="relative h-40 w-40 shrink-0">
              <Doughnut data={{
                labels: visibleRecruitmentStages.map(stage => stage.label),
                datasets: [{ data: visibleRecruitmentStages.map(stage => stage.count), backgroundColor: visibleRecruitmentStages.map(stage => stage.color), borderWidth: 2, borderColor: '#fff', hoverOffset: 4 }]
              }} options={{
                responsive: true, maintainAspectRatio: false, cutout: '72%',
                plugins: {
                  legend: { display: false },
                  tooltip: { callbacks: { label: (context) => `${context.label}: ${visibleRecruitmentStages[context.dataIndex].count}` } },
                },
              }} />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl font-extrabold text-slate-800">{total}</span><span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Kandidat</span></div>
            </div>
            <ul className="min-w-0 space-y-2.5 text-[11px]">
              {visibleRecruitmentStages.map(stage => <li key={stage.id} className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} /><span>{stage.label}</span><b className="ml-auto pl-2 text-slate-800">{stage.count}</b></li>)}
            </ul>
          </div>
        </section>

        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-2"><div><h3 className="text-sm font-bold text-slate-800">Penempatan Final</h3><p className="text-[11px] text-slate-500">Kandidat dengan departemen yang ditetapkan</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">Total {countPlaced}</span></div>
          <div className="h-[170px] w-full">
            <Bar
              data={{
                labels: ['LSSD', 'LSPD'],
                datasets: [{ label: 'Kandidat', data: [countLssd, countLspd], backgroundColor: ['#315842', '#7FA886'], borderRadius: 7, barThickness: 25, maxBarThickness: 30 }]
              }}
              options={{
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                layout: { padding: { right: 30 } },
                plugins: { legend: { display: false }, tooltip: { displayColors: false } },
                scales: {
                  x: { beginAtZero: true, suggestedMax: Math.max(countLssd, countLspd, 1), ticks: { precision: 0, font: { size: 10 } }, grid: { color: '#eef2f7', drawBorder: false } },
                  y: { ticks: { color: '#475569', font: { size: 11, weight: 'bold' } }, grid: { display: false, drawBorder: false } },
                },
              }}
              plugins={[departmentLogoPlugin]}
            />
          </div>
        </section>
      </div>

      {/* TABEL REKAP + BAR FILTER + PAGINATION */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-3 pb-2 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-800">Daftar Rekap Kandidat</h2>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                isFilterActive ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
              }`}>
                {isFilterActive ? 'Urutan: Abjad Nama (A-Z)' : 'Urutan: Terakhir Diupdate'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Menampilkan {paginatedCandidates.length} dari {sortedCandidates.length} hasil.
            </p>
          </div>

          {/* BAR FILTER */}
          <div className="flex items-center gap-2 flex-wrap">
            <input 
              type="text" 
              placeholder="Cari nama..." 
              className="border border-slate-300 p-2 rounded-lg text-xs text-slate-900 bg-white w-44 focus:outline-none focus:border-blue-500" 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />

            <select 
              className="border border-slate-300 p-2 rounded-lg text-xs text-slate-900 bg-white font-semibold focus:outline-none focus:border-blue-500" 
              value={filterStatus} 
              onChange={e => setFilterStatus(e.target.value)}>
              <option value="ALL">Semua Status CV</option>
              <option value="NEW">🔵 Antrean Baru</option>
              <option value="Pending">🟡 Pending</option>
              <option value="Interview">🟣 Lolos Review CV</option>
              <option value="Rejected">🔴 Ditolak CV</option>
            </select>

            <select
              className="border border-slate-300 p-2 rounded-lg text-xs text-slate-900 bg-white font-semibold focus:outline-none focus:border-blue-500"
              value={filterInterview}
              onChange={e => setFilterInterview(e.target.value)}>
              <option value="ALL">Semua Status Interview</option>
              <option value="NO_RESULT">Belum ada keputusan</option>
              <option value="Pending">Interview Pending</option>
              <option value="Passed">Lulus interview</option>
              <option value="Failed">Tidak lulus interview</option>
            </select>

            <select 
              className="border border-slate-300 p-2 rounded-lg text-xs text-slate-900 bg-white font-semibold focus:outline-none focus:border-blue-500" 
              value={filterMdt} 
              onChange={e => setFilterMdt(e.target.value)}>
              <option value="ALL">Semua MDT</option>
              <option value="Green">🟢 MDT Green</option>
              <option value="Orange">🟠 MDT Orange</option>
              <option value="Red">🔴 MDT Red</option>
            </select>

            <select 
              className="border border-slate-300 p-2 rounded-lg text-xs text-slate-900 bg-white font-semibold focus:outline-none focus:border-blue-500" 
              value={filterDept} 
              onChange={e => setFilterDept(e.target.value)}>
              <option value="ALL">Semua Dept</option>
              <option value="LSSD">🏢 LSSD</option>
              <option value="LSPD">🚓 LSPD</option>
            </select>
          </div>
        </div>

        {/* TABEL DATA */}
        <div className="overflow-x-auto">
          <table className="dashboard-candidate-table w-full text-center border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                <th className="p-3 text-left align-middle">Nama Kandidat</th>
                <th className="p-3 text-center align-middle">Gender</th>
                <th className="p-3 text-center align-middle">Status CV</th>
                <th className="p-3 text-center align-middle">MDT Check</th>
                <th className="p-3 text-center align-middle">Status Interview</th>
                <th className="p-3 text-center align-middle">Reviewer CV</th>
                <th className="p-3 text-center align-middle">Interviewer</th>
                <th className="p-3 text-center align-middle">Dept Final</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="align-middle"><td colSpan="8" className="p-6 text-center align-middle text-slate-400">Memuat data rekap...</td></tr>
              ) : paginatedCandidates.length === 0 ? (
                <tr className="align-middle"><td colSpan="8" className="p-6 text-center align-middle text-slate-400">Tidak ada kandidat yang cocok.</td></tr>
              ) : (
                paginatedCandidates.map(c => {
                  const statusDisplay = !c.status_cv ? 'Antrean Baru' : c.status_cv === 'Interview' ? 'Lolos Review CV' : c.status_cv;
                  const mdtStatus = normalizeMdtStatus(c.mdt_check);
                  const interviewStatusDisplay = c.status_cv !== 'Interview'
                    ? 'Belum Interview'
                    : c.status_interview || 'Belum Diputuskan';
                  return (
                    <tr key={c.id} className="dashboard-candidate-row align-middle border-b border-slate-100 hover:bg-slate-50/80 transition">
                      <td className="p-3 align-middle text-left font-bold text-slate-800"><button type="button" title={c.nama} onClick={() => setDetailCandidate(c)} aria-haspopup="dialog" className="text-left text-slate-800 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">{c.nama}</button></td>
                      <td className="p-3 align-middle text-center text-slate-600">{c.gender || '—'}</td>
                      <td className="p-3 align-middle text-center">
                        <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] ${
                          c.status_cv === 'Interview' ? 'bg-indigo-100 text-indigo-800 border border-indigo-300' :
                          c.status_cv === 'Pending' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                          c.status_cv === 'Rejected' ? 'bg-rose-100 text-rose-800 border border-rose-300' : 
                          'bg-blue-100 text-blue-800 border border-blue-300'
                        }`}>
                          {statusDisplay}
                        </span>
                      </td>
                      <td className="p-3 align-middle text-center font-semibold">
                        {mdtStatus ? (
                          <span className={`mdt-status-badge ${mdtStatus.toLowerCase()}`}>
                            {mdtStatus}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-3 align-middle text-center">
                        <span className={`dashboard-interview-status whitespace-nowrap rounded-full border px-2 py-1 text-[9px] font-bold ${
                          c.status_interview === 'Passed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                          c.status_interview === 'Failed' ? 'border-rose-200 bg-rose-50 text-rose-700' :
                          c.status_interview === 'Pending' ? 'border-amber-200 bg-amber-50 text-amber-700' :
                          'border-slate-200 bg-slate-50 text-slate-500'
                        }`}>{interviewStatusDisplay}</span>
                      </td>
                      <td className="p-3 align-middle text-center text-slate-600">{displayStaffFirstNames(c.officer_reviewer)}</td>
                      <td className="p-3 align-middle text-center text-slate-600">{displayStaffFirstNames([c.interviewer_name, c.assist_name].filter(Boolean).join(', '))}</td>
                      <td className="p-3 align-middle text-center">{c.mapping_dept ? <span className={departmentBadgeClass(c.mapping_dept)}>{c.mapping_dept}</span> : <span className="text-slate-500">—</span>}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* FITUR PAGINATION (10 DATA PER PAGE) */}
        {!loading && sortedCandidates.length > 0 && (
          <Pagination page={currentPage} totalItems={sortedCandidates.length} onPageChange={setCurrentPage} />
        )}

      </div>

      {detailCandidate && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-950/60 p-2 backdrop-blur-sm sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailCandidate(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="candidate-detail-title" className="candidate-detail-modal flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-4">
          <header className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="candidate-detail-heading min-w-0"><p className="candidate-detail-kicker text-[11px] font-bold uppercase tracking-wider">Rincian kandidat</p><h2 id="candidate-detail-title" className="mt-0.5 truncate text-xl font-bold text-slate-900">{detailCandidate.nama}</h2><div className="candidate-detail-badges mt-1.5 flex flex-wrap items-center gap-1.5"><span className="candidate-detail-gender rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">{detailCandidate.gender || 'Gender belum diisi'}</span><span className={departmentBadgeClass(detailCandidate.mapping_dept)}>{detailCandidate.mapping_dept || 'Belum ada departemen final'}</span></div></div>
            <div className="candidate-detail-actions flex shrink-0 items-center gap-2">{detailCandidate.link_cv && <a href={detailCandidate.link_cv} target="_blank" rel="noreferrer" className="candidate-detail-cv-link inline-flex rounded-lg px-3 py-2 text-xs font-bold text-white shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Buka Thread CV ↗</a>}<button type="button" onClick={() => setDetailCandidate(null)} aria-label="Tutup rincian kandidat" className="candidate-detail-close rounded-lg px-3 py-1 text-2xl leading-none text-slate-500 hover:bg-slate-100">×</button></div>
          </header>
          <div className={`grid min-h-0 flex-1 gap-3 overflow-hidden ${detailNotes.length >= 3 ? 'md:grid-cols-[1.05fr_0.95fr]' : ''}`}>
            <section className="min-h-0 overflow-hidden pr-1"><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Data dan proses</h3><div className="mb-2 grid grid-cols-3 gap-2">
              <DetailStatus label="Status CV" value={!detailCandidate.status_cv ? 'Antrean Baru' : detailCandidate.status_cv === 'Interview' ? 'Lolos Review CV' : detailCandidate.status_cv} tone={detailCandidate.status_cv === 'Rejected' ? 'red' : detailCandidate.status_cv === 'Pending' ? 'amber' : detailCandidate.status_cv === 'Interview' ? 'indigo' : 'slate'} />
              <DetailStatus label="MDT" value={normalizeMdtStatus(detailCandidate.mdt_check) || 'Belum diperiksa'} tone={normalizeMdtStatus(detailCandidate.mdt_check) === 'Green' ? 'green' : normalizeMdtStatus(detailCandidate.mdt_check) === 'Red' ? 'red' : 'amber'} />
              <DetailStatus label="Status Interview" value={detailCandidate.status_cv !== 'Interview' ? 'Belum masuk tahap' : detailCandidate.status_interview || 'Belum ada keputusan'} tone={detailCandidate.status_interview === 'Passed' ? 'green' : detailCandidate.status_interview === 'Failed' ? 'red' : detailCandidate.status_interview === 'Pending' ? 'amber' : 'slate'} />
            </div><div className="grid grid-cols-2 gap-2">
              <DetailField label="Minat departemen" value={detailCandidate.dept_preference || 'Belum diisi'} />
              <DetailField label="Departemen final" value={detailCandidate.mapping_dept || 'Belum ditetapkan'} />
              <DetailField label="Reviewer CV" value={detailCandidate.officer_reviewer || '—'} />
              <DetailField label="Interviewer" value={[detailCandidate.interviewer_name, detailCandidate.assist_name].filter((name) => typeof name === 'string' && name.trim()).join(', ') || '—'} />
            </div>{detailNotes.length > 0 && detailNotes.length < 3 && <div className="mt-3"><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Catatan dan saran evaluator</h3><div className="grid gap-2 sm:grid-cols-2">{detailNotes.map(([label, value]) => <DetailField key={label} label={label} value={value} multiline />)}</div></div>}</section>
            {detailNotes.length >= 3 && <section className="min-h-0 overflow-hidden pr-1"><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Catatan dan saran evaluator</h3><div className="grid gap-2 sm:grid-cols-2">
              {detailNotes.map(([label, value]) => <DetailField key={label} label={label} value={value} multiline />)}
            </div>
            </section>}
          </div>
          <footer className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-500"><span>Didaftarkan: {detailCandidate.created_at ? new Date(detailCandidate.created_at).toLocaleString('id-ID') : '—'}</span><span>Terakhir diperbarui: {detailCandidate.updated_at ? new Date(detailCandidate.updated_at).toLocaleString('id-ID') : '—'}</span></footer>
        </section>
      </div>}
    </div>
  );
}

function DetailField({ label, value, multiline = false }) {
  return <div className="candidate-detail-field min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
    <div className="text-[11px] font-semibold text-slate-500">{label}</div>
    <div className={`mt-0.5 text-[13px] leading-5 text-slate-800 ${multiline ? 'max-h-24 overflow-y-auto whitespace-pre-wrap break-words pr-1' : 'break-words'}`}>{value}</div>
  </div>;
}

function DetailStatus({ label, value, tone }) {
  return <div className="candidate-detail-status min-w-0 rounded-lg border border-slate-100 bg-white px-2 py-1.5"><div className="mb-1 text-[10px] font-semibold text-slate-500">{label}</div><span className={`detail-status-pill detail-status-pill-${tone}`}><span className="truncate">{value}</span></span></div>;
}
