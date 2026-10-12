'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BatchContext } from '../BatchContext';

function formatTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(value));
}

function formatClock(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date(value));
}

function statusLabel(status) {
  if (status === 'PRESENT') return 'Hadir';
  if (status === 'ABSENT') return 'Tidak hadir';
  if (status === 'EXCUSED') return 'Izin';
  return 'Belum dicatat';
}

function statusStyle(status) {
  if (status === 'PRESENT') return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  if (status === 'ABSENT') return 'bg-rose-50 text-rose-800 ring-rose-200';
  if (status === 'EXCUSED') return 'bg-amber-50 text-amber-800 ring-amber-200';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

export default function AcademyAttendancePage() {
  const { selectedBatch } = useContext(BatchContext);
  const selectedBatchId = selectedBatch?.id;
  const [data, setData] = useState({ candidates: [], batches: [], attendance: [], personnel: [], department: '', role: 'STAFF', personnelId: '' });
  const [equipment, setEquipment] = useState({ statuses: [] });
  const [activeTab, setActiveTab] = useState('attendance');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!selectedBatchId) return;
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const [response, equipmentResponse] = await Promise.all([
        fetch(`/api/internal/academy?batch_id=${encodeURIComponent(selectedBatchId)}`, { cache: 'no-store' }),
        fetch(`/api/internal/interview-equipment?batch_id=${encodeURIComponent(selectedBatchId)}`, { cache: 'no-store' }),
      ]);
      const [result, equipmentResult] = await Promise.all([response.json(), equipmentResponse.json()]);
      if (!response.ok || !result.success) throw new Error(result.error || 'Daftar Academy gagal dimuat.');
      setData(result);
      if (equipmentResult.success) setEquipment({ statuses: equipmentResult.statuses || [] });
      setError('');
      setLastSyncedAt(new Date().toISOString());
    } catch (issue) {
      setError(issue.message || 'Daftar Academy gagal dimuat.');
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  }, [selectedBatchId]);

  useEffect(() => {
    queueMicrotask(() => { void refresh(); });
    const source = selectedBatchId ? new EventSource(`/api/internal/academy/stream?batch_id=${encodeURIComponent(selectedBatchId)}`) : null;
    source?.addEventListener('ready', () => setRealtimeConnected(true));
    source?.addEventListener('attendance_changed', () => refresh());
    source?.addEventListener('realtime_unavailable', () => setRealtimeConnected(false));
    if (source) source.onerror = () => setRealtimeConnected(false);
    const timer = window.setInterval(refresh, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      source?.close();
    };
  }, [refresh, selectedBatchId]);

  const attendanceByCandidate = useMemo(() => new Map(data.attendance.map((row) => [String(row.candidate_id), row])), [data.attendance]);
  const equipmentByCandidate = useMemo(() => new Map(equipment.statuses.map((row) => [String(row.candidate_id), row])), [equipment.statuses]);
  const setStatus = async (candidateId, status) => {
    const key = String(candidateId);
    const previous = data.attendance.find((row) => String(row.candidate_id) === key);
    setError('');
    setMessage('');
    setSavingId(key);
    setData((current) => ({ ...current, attendance: previous
      ? current.attendance.map((row) => String(row.candidate_id) === key ? { ...row, attendance_status: status, updated_by: 'Menyimpan…', updated_at: new Date().toISOString() } : row)
      : [...current.attendance, { candidate_id: key, batch_id: selectedBatch.id, attendance_status: status, updated_by: 'Menyimpan…', updated_at: new Date().toISOString() }] }));
    try {
      const response = await fetch('/api/internal/academy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: key, batchId: selectedBatch.id, status }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Absensi gagal disimpan.');
      setMessage(`Status ${statusLabel(status).toLowerCase()} berhasil diperbarui.`);
      await refresh();
    } catch (issue) {
      setError(issue.message || 'Absensi gagal disimpan.');
      if (previous) setData((current) => ({ ...current, attendance: current.attendance.map((row) => String(row.candidate_id) === key ? previous : row) }));
      else refresh();
    } finally {
      setSavingId('');
    }
  };

  const setEquipmentStatus = async (candidateId, item, status) => {
    const key = String(candidateId);
    if (savingId) return;
    setError(''); setMessage(''); setSavingId(key);
    try {
      const response = await fetch('/api/internal/interview-equipment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: key, batchId: selectedBatch.id, item, status }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Status kunci/lencana gagal disimpan.');
      setMessage(`${item === 'KEY' ? 'Kunci' : 'Lencana'} berhasil diperbarui.`);
      await refresh();
    } catch (issue) { setError(issue.message || 'Status kunci/lencana gagal disimpan.'); }
    finally { setSavingId(''); }
  };

  const candidateRows = useMemo(() => data.candidates.map((candidate) => ({
    candidate,
    attendance: attendanceByCandidate.get(String(candidate.id)),
    department: candidate.mapping_dept || 'Belum ditentukan',
  })), [data.candidates, attendanceByCandidate]);
  const presentCount = candidateRows.filter(({ attendance }) => attendance?.attendance_status === 'PRESENT').length;
  const departments = useMemo(() => {
    const grouped = new Map();
    for (const row of candidateRows) {
      const name = ['LSPD', 'LSSD', 'DOC'].includes(String(row.department).toUpperCase()) ? String(row.department).toUpperCase() : 'Belum ditentukan';
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name).push(row);
    }
    return [...grouped.entries()].sort(([left], [right]) => ['LSPD', 'LSSD', 'DOC', 'Belum ditentukan'].indexOf(left) - ['LSPD', 'LSSD', 'DOC', 'Belum ditentukan'].indexOf(right));
  }, [candidateRows]);

  const renderCandidateCard = ({ candidate, attendance, department }, interactive) => {
    const status = attendance?.attendance_status || 'PENDING';
    const busy = savingId === String(candidate.id);
    return <article key={candidate.id} className={`rounded-xl border p-2.5 transition ${interactive ? 'border-emerald-200 bg-white shadow-sm shadow-emerald-900/5' : 'border-slate-200 bg-slate-100/80'}`}>
      <div className="flex min-w-0 items-center gap-2">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${interactive ? 'bg-[#1E3A2B] text-white' : 'bg-slate-300 text-slate-600'}`}>{candidate.nama.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{candidate.nama}</strong><small className="text-xs text-slate-500">{department}</small></div>
          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ring-1 ${statusStyle(status)}`}>{statusLabel(status)}</span>
        </div>
      {interactive && <div className="mt-2 grid grid-cols-3 gap-1.5" aria-label={`Ubah absensi ${candidate.nama}`}>
        <button type="button" disabled={busy} aria-pressed={status === 'PRESENT'} onClick={() => setStatus(String(candidate.id), status === 'PRESENT' ? 'PENDING' : 'PRESENT')} className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition disabled:cursor-wait disabled:opacity-50 ${status === 'PRESENT' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'}`}>{busy ? 'Menyimpan…' : 'Hadir'}</button>
        <button type="button" disabled={busy} aria-pressed={status === 'ABSENT'} onClick={() => setStatus(String(candidate.id), 'ABSENT')} className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition disabled:cursor-wait disabled:opacity-50 ${status === 'ABSENT' ? 'border-rose-500 bg-rose-500 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-rose-50'}`}>Tidak hadir</button>
        <button type="button" disabled={busy} aria-pressed={status === 'EXCUSED'} onClick={() => setStatus(String(candidate.id), 'EXCUSED')} className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition disabled:cursor-wait disabled:opacity-50 ${status === 'EXCUSED' ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-amber-50'}`}>Izin</button>
      </div>}
    </article>;
  };

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1E3A2B]">Academy · {selectedBatch?.name || 'Batch belum dipilih'}</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Absensi Kandidat</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Absensi dan pembagian perlengkapan dikelompokkan menurut departemen. Perubahan tersinkron untuk personel lain di batch ini.</p></div><div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${realtimeConnected ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}><span className={`h-2.5 w-2.5 rounded-full ${realtimeConnected ? 'animate-pulse bg-emerald-600' : 'bg-amber-500'}`}/>{realtimeConnected ? 'LIVE · tersambung' : 'Sinkronisasi otomatis'}</div></div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl border border-slate-100 p-3"><small className="text-xs text-slate-500">Kandidat</small><strong className="mt-1 block text-xl text-slate-900">{data.candidates.length}</strong></div><div className="rounded-xl border border-slate-100 p-3"><small className="text-xs text-slate-500">Departemen aktif</small><strong className="mt-1 block text-xl text-slate-900">{departments.length}</strong></div><div className="rounded-xl border border-slate-100 p-3"><small className="text-xs text-slate-500">Hadir</small><strong className="mt-1 block text-xl text-emerald-700">{presentCount}</strong></div><div className="rounded-xl border border-slate-100 p-3"><small className="text-xs text-slate-500">Terakhir sinkron</small><strong className="mt-1 block text-sm text-slate-800">{lastSyncedAt ? formatTime(lastSyncedAt) : 'Memuat…'}</strong></div></div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{message && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    </section>

    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Memuat data Academy…</div> : <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"><div><h3 className="font-bold text-slate-900">Academy per Departemen</h3><p className="mt-1 text-xs text-slate-500">Jadwal Academy: {formatTime(data.batches[0]?.academy_start)} – {formatTime(data.batches[0]?.academy_end)}</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{data.role === 'ADMIN' ? 'Admin · seluruh departemen' : `${data.department || 'Staff'} · kandidat departemen sendiri`}</span></div>
      <div role="tablist" aria-label="Menu Academy" className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1">
        <button type="button" role="tab" aria-selected={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')} className={`rounded-lg px-4 py-3 text-sm font-bold transition ${activeTab === 'attendance' ? 'bg-white text-[#1E3A2B] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Absensi</button>
        <button type="button" role="tab" aria-selected={activeTab === 'equipment'} onClick={() => setActiveTab('equipment')} className={`rounded-lg px-4 py-3 text-sm font-bold transition ${activeTab === 'equipment' ? 'bg-white text-[#1E3A2B] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Pemberian Kunci/Lencana</button>
      </div>
      {loading ? null : !candidateRows.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Belum ada kandidat pada batch ini.</div> : activeTab === 'attendance' ? <div className="space-y-4">
        {departments.map(([department, rows]) => {
          const editable = data.role === 'ADMIN' || department === data.department;
          const countPresent = rows.filter(({ attendance }) => attendance?.attendance_status === 'PRESENT').length;
          return <section key={department} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><header className="mb-3 flex items-center justify-between gap-3"><div><h4 className="text-base font-bold text-slate-900">{department}</h4><p className="text-xs text-slate-500">{editable ? 'Anda dapat memperbarui absensi departemen ini.' : 'Rekap departemen lain.'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{countPresent}/{rows.length} hadir</span></header><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{rows.map((row) => renderCandidateCard(row, editable))}</div></section>;
        })}
      </div> : <div className="space-y-4">
        <p className="text-sm text-slate-600">Catat status penyerahan dan pengembalian. Setiap perubahan tersimpan pada log personel dan waktu.</p>
        {departments.map(([department, rows]) => {
          const editable = data.role === 'ADMIN' || department === data.department;
          return <section key={department} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><header className="mb-3 flex items-center justify-between gap-3"><div><h4 className="text-base font-bold text-slate-900">{department}</h4><p className="text-xs text-slate-500">{rows.length} kandidat · {editable ? 'ubah status penerimaan' : 'hanya lihat'}</p></div></header><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{rows.map(({ candidate }) => {
            const status = equipmentByCandidate.get(String(candidate.id));
            const busy = savingId === String(candidate.id);
            const received = status?.key_status === 'ISSUED' && status?.badge_status === 'ISSUED';
            return <article key={candidate.id} className={`flex h-[104px] min-w-0 items-center gap-3 rounded-xl border p-3 ${received ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
              <input type="checkbox" aria-label={`${candidate.nama} sudah menerima kunci dan lencana`} checked={received} disabled={!editable || busy} onChange={(event) => setEquipmentStatus(candidate.id, 'KIT', event.target.checked ? 'ISSUED' : 'PENDING')} className="h-5 w-5 shrink-0 accent-[#1E3A2B] disabled:opacity-50" />
              <div className="flex h-full min-w-0 flex-1 flex-col justify-center gap-1">
                <span className="line-clamp-2 break-words text-sm font-semibold leading-4 text-slate-900" title={candidate.nama}>{candidate.nama}</span>
                {received ? <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-4">
                  <span className="inline-flex shrink-0 items-center gap-1 font-bold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />Diberikan</span>
                  {status?.updated_by && <span className="min-w-0 truncate text-slate-600" title={status.updated_by}>{status.updated_by}</span>}
                  {status?.updated_at && <time className="shrink-0 text-slate-500" dateTime={status.updated_at}>{formatClock(status.updated_at)}</time>}
                </div> : <span className="text-xs leading-4 text-slate-600">Belum Diberikan</span>}
              </div>
            </article>;
          })}</div></section>;
        })}
      </div>}
      <p className="px-1 text-xs text-slate-500">Status tersinkron otomatis. Personel hanya dapat mengubah data kandidat di departemennya; admin dapat mengelola seluruh departemen.</p>
    </section>}
  </div>;
}
