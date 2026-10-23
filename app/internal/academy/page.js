'use client';

import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BatchContext } from '../BatchContext';
import { isStageWindowOpen } from '@/lib/stage-access';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

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

function isEquipmentIssued(status) {
  return status?.key_status === 'ISSUED' || status?.badge_status === 'ISSUED';
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
  const [selectedAttendanceIds, setSelectedAttendanceIds] = useState(() => new Set());
  const [excuseDialog, setExcuseDialog] = useState(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const refreshInFlight = useRef(false);
  const sortableListRef = useRef(null);
  const previousSortableRowTops = useRef(new Map());

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
    setSelectedAttendanceIds(new Set());
  }, [selectedBatchId]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useIsomorphicLayoutEffect(() => {
    const container = sortableListRef.current;
    if (!container) {
      previousSortableRowTops.current = new Map();
      return;
    }
    const nextPositions = new Map();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const row of container.querySelectorAll('[data-sort-row]')) {
      const key = row.getAttribute('data-sort-row');
      const top = row.getBoundingClientRect().top;
      const previousTop = previousSortableRowTops.current.get(key);
      if (!reduceMotion && previousTop !== undefined && Math.abs(previousTop - top) > 1) {
        row.animate(
          [{ transform: 'translateY(' + (previousTop - top) + 'px)' }, { transform: 'translateY(0)' }],
          { duration: 260, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
        );
      }
      nextPositions.set(key, top);
    }
    previousSortableRowTops.current = nextPositions;
  }, [activeTab, data.attendance, equipment.statuses]);

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
  const setStatus = async (candidateId, status, excuseReason = '') => {
    const key = String(candidateId);
    if (savingId) return;
    const previous = data.attendance.find((row) => String(row.candidate_id) === key);
    setError('');
    setMessage('');
    setSavingId(key);
    setData((current) => ({ ...current, attendance: previous
      ? current.attendance.map((row) => String(row.candidate_id) === key ? { ...row, attendance_status: status, excuse_reason: status === 'EXCUSED' ? excuseReason : null, updated_by: 'Menyimpan…', updated_at: new Date().toISOString() } : row)
      : [...current.attendance, { candidate_id: key, batch_id: selectedBatch.id, attendance_status: status, excuse_reason: status === 'EXCUSED' ? excuseReason : null, updated_by: 'Menyimpan…', updated_at: new Date().toISOString() }] }));
    try {
      const response = await fetch('/api/internal/academy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: key, batchId: selectedBatch.id, status, ...(status === 'EXCUSED' ? { excuseReason } : {}) }),
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

  const requestAttendanceStatus = (rows, status, bulk = false) => {
    if (!bulk && rows.length === 1) {
      const candidateId = String(rows[0].candidate.id);
      const currentStatus = attendanceByCandidate.get(candidateId)?.attendance_status || 'PENDING';
      if (currentStatus === status) {
        void setStatus(candidateId, 'PENDING');
        return;
      }
    }
    if (status === 'EXCUSED') {
      setExcuseDialog({ rows, bulk, reason: '' });
      return;
    }
    if (bulk) void setSelectedAttendanceStatus(rows, status);
    else void setStatus(rows[0].candidate.id, status);
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
      setMessage(`${item === 'KIT' ? 'Lencana' : item === 'KEY' ? 'Kunci' : 'Lencana'} berhasil diperbarui.`);
      await refresh();
    } catch (issue) { setError(issue.message || 'Status kunci/lencana gagal disimpan.'); }
    finally { setSavingId(''); }
  };

  const toggleAttendanceSelection = (candidateId) => {
    const key = String(candidateId);
    setSelectedAttendanceIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleDepartmentAttendanceSelection = (rows, selected) => {
    setSelectedAttendanceIds((current) => {
      const next = new Set(current);
      for (const { candidate } of rows) {
        if (selected) next.add(String(candidate.id));
        else next.delete(String(candidate.id));
      }
      return next;
    });
  };

  const setSelectedAttendanceStatus = async (rows, status, excuseReason = '') => {
    if (savingId) return;
    setError(''); setMessage(''); setSavingId('bulk-attendance');
    const selectedRows = rows.filter(({ candidate }) => selectedAttendanceIds.has(String(candidate.id)));
    try {
      const results = await Promise.allSettled(selectedRows.map(async ({ candidate }) => {
        const response = await fetch('/api/internal/academy', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidateId: String(candidate.id), batchId: selectedBatch.id, status, ...(status === 'EXCUSED' ? { excuseReason } : {}) }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || `Absensi ${candidate.nama} gagal disimpan.`);
        return result;
      }));
      const failure = results.find((result) => result.status === 'rejected');
      if (failure) throw failure.reason;
      if (results.length) {
        setMessage(`Absensi ${selectedRows.length} kandidat berhasil diperbarui.`);
        setSelectedAttendanceIds((current) => {
          const next = new Set(current);
          for (const { candidate } of selectedRows) next.delete(String(candidate.id));
          return next;
        });
      }
      await refresh();
    } catch (issue) {
      setError(issue.message || 'Absensi kandidat terpilih gagal disimpan.');
      await refresh();
    } finally { setSavingId(''); }
  };

  const setDepartmentBadges = async (rows, status) => {
    if (savingId) return;
    setError(''); setMessage(''); setSavingId('bulk-equipment');
    try {
      const targetIssued = status === 'ISSUED';
      const rowsToUpdate = rows.filter(({ candidate }) => {
        const current = equipmentByCandidate.get(String(candidate.id));
        const targetStatus = targetIssued ? 'ISSUED' : 'PENDING';
        return (current?.key_status || 'PENDING') !== targetStatus || (current?.badge_status || 'PENDING') !== targetStatus;
      });
      const results = await Promise.allSettled(rowsToUpdate.map(async ({ candidate }) => {
        const response = await fetch('/api/internal/interview-equipment', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidateId: String(candidate.id), batchId: selectedBatch.id, item: 'KIT', status }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || `Status lencana ${candidate.nama} gagal disimpan.`);
        return result;
      }));
      const failure = results.find((result) => result.status === 'rejected');
      if (failure) throw failure.reason;
      if (results.length) setMessage(`Status lencana ${rowsToUpdate.length} kandidat berhasil diperbarui.`);
      await refresh();
    } catch (issue) {
      setError(issue.message || 'Status lencana kandidat gagal disimpan.');
      await refresh();
    } finally { setSavingId(''); }
  };

  const candidateRows = useMemo(() => data.candidates.map((candidate) => ({
    candidate,
    attendance: attendanceByCandidate.get(String(candidate.id)),
    department: candidate.mapping_dept || 'Belum ditentukan',
  })), [data.candidates, attendanceByCandidate]);
  const presentCount = candidateRows.filter(({ attendance }) => attendance?.attendance_status === 'PRESENT').length;
  const academyOpen = isStageWindowOpen(data.batches[0]?.academy_start, data.batches[0]?.academy_end, clockNow);
  const departments = useMemo(() => {
    const grouped = new Map();
    for (const row of candidateRows) {
      const name = ['LSPD', 'LSSD', 'SASP', 'DOC'].includes(String(row.department).toUpperCase()) ? String(row.department).toUpperCase() : 'Belum ditentukan';
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name).push(row);
    }
    return [...grouped.entries()].sort(([left], [right]) => ['LSPD', 'LSSD', 'SASP', 'DOC', 'Belum ditentukan'].indexOf(left) - ['LSPD', 'LSSD', 'SASP', 'DOC', 'Belum ditentukan'].indexOf(right));
  }, [candidateRows]);
  const activeDepartmentCount = departments.filter(([department]) => department !== 'Belum ditentukan').length;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1E3A2B]">Academy · {selectedBatch?.name || 'Batch belum dipilih'}</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Absensi Kandidat</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Absensi dan pembagian perlengkapan dikelompokkan menurut departemen. Perubahan tersinkron untuk personel lain di batch ini.</p></div><div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${realtimeConnected ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}><span className={`h-2.5 w-2.5 rounded-full ${realtimeConnected ? 'animate-pulse bg-emerald-600' : 'bg-amber-500'}`}/>{realtimeConnected ? 'LIVE · tersambung' : 'Sinkronisasi otomatis'}</div></div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl border border-slate-100 p-3"><small className="text-xs text-slate-500">Kandidat</small><strong className="mt-1 block text-xl text-slate-900">{data.candidates.length}</strong></div><div className="rounded-xl border border-slate-100 p-3"><small className="text-xs text-slate-500">Departemen aktif</small><strong className="mt-1 block text-xl text-slate-900">{activeDepartmentCount}</strong></div><div className="rounded-xl border border-slate-100 p-3"><small className="text-xs text-slate-500">Hadir</small><strong className="mt-1 block text-xl text-emerald-700">{presentCount}</strong></div><div className="rounded-xl border border-slate-100 p-3"><small className="text-xs text-slate-500">Terakhir sinkron</small><strong className="mt-1 block text-sm text-slate-800">{lastSyncedAt ? formatTime(lastSyncedAt) : 'Memuat…'}</strong></div></div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{message && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    </section>

    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Memuat data Academy…</div> : <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"><div><h3 className="font-bold text-slate-900">Academy per Departemen</h3><p className="mt-1 text-xs text-slate-500">Jadwal Academy: {formatTime(data.batches[0]?.academy_start)} – {formatTime(data.batches[0]?.academy_end)}</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{data.role === 'ADMIN' ? 'Admin · seluruh departemen' : `${data.department || 'Staff'} · kandidat departemen sendiri`}</span></div>
      <div role="tablist" aria-label="Menu Academy" className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1">
        <button type="button" role="tab" aria-selected={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')} className={`rounded-lg px-4 py-3 text-sm font-bold transition ${activeTab === 'attendance' ? 'bg-white text-[#1E3A2B] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Absensi</button>
        <button type="button" role="tab" aria-selected={activeTab === 'equipment'} onClick={() => setActiveTab('equipment')} className={`rounded-lg px-4 py-3 text-sm font-bold transition ${activeTab === 'equipment' ? 'bg-white text-[#1E3A2B] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Pemberian Lencana</button>
      </div>
      {loading ? null : !candidateRows.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Belum ada kandidat pada batch ini.</div> : activeTab === 'attendance' ? <div ref={sortableListRef} className="space-y-4">
        {departments.map(([department, rows]) => {
          const editable = data.role === 'ADMIN' || department === data.department;
          const countPresent = rows.filter(({ attendance }) => attendance?.attendance_status === 'PRESENT').length;
          const selectedCount = rows.filter(({ candidate }) => selectedAttendanceIds.has(String(candidate.id))).length;
          const allSelected = selectedCount === rows.length;
          const sortedRows = [...rows].sort((left, right) => {
            const leftRecorded = left.attendance?.attendance_status && left.attendance.attendance_status !== 'PENDING' ? 1 : 0;
            const rightRecorded = right.attendance?.attendance_status && right.attendance.attendance_status !== 'PENDING' ? 1 : 0;
            return leftRecorded - rightRecorded || String(left.candidate.nama || '').localeCompare(String(right.candidate.nama || ''), 'id-ID', { sensitivity: 'base' });
          });
          const statusOptions = [['PRESENT', 'Hadir'], ['ABSENT', 'T.Hadir'], ['EXCUSED', 'Izin']];
          return <section key={department} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-3">
                <input type="checkbox" aria-label={'Pilih semua kandidat ' + department} checked={allSelected} onChange={(event) => toggleDepartmentAttendanceSelection(rows, event.target.checked)} className="h-4 w-4 accent-[#1E3A2B]" />
                <div><h4 className="text-sm font-bold text-slate-900">{department}</h4><p className="text-xs text-slate-500">{countPresent}/{rows.length} hadir · {editable ? 'dapat diperbarui' : 'hanya lihat'}</p></div>
              </div>
              {selectedCount > 0 && <div className="flex items-center gap-1.5"><span className="mr-1 text-xs text-slate-500">{selectedCount} dipilih</span>{statusOptions.map(([status, label]) => <button key={status} type="button" disabled={!editable || Boolean(savingId) || (!academyOpen && status !== 'EXCUSED')} onClick={() => requestAttendanceStatus(rows.filter(({ candidate }) => selectedAttendanceIds.has(String(candidate.id))), status, true)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{label}</button>)}</div>}
            </header>
            <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><tr><th className="w-10 px-4 py-2.5" aria-label="Pilih"/><th className="px-3 py-2.5">Kandidat</th><th className="px-3 py-2.5">Departemen</th><th className="px-3 py-2.5">Status absensi</th><th className="px-3 py-2.5">Aksi cepat</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{sortedRows.map(({ candidate, attendance }) => {
                const key = String(candidate.id);
                const status = attendance?.attendance_status || 'PENDING';
                const statusText = status === 'EXCUSED' && attendance?.excuse_reason ? 'Izin (' + attendance.excuse_reason + ')' : statusLabel(status);
                const busy = savingId === key || Boolean(savingId && savingId.startsWith('bulk-'));
                return <tr key={key} data-sort-row={'attendance-' + key} className="hover:bg-slate-50/70">
                  <td className="px-4 py-2.5"><input type="checkbox" aria-label={'Pilih ' + candidate.nama} checked={selectedAttendanceIds.has(key)} onChange={() => toggleAttendanceSelection(key)} className="h-4 w-4 accent-[#1E3A2B]" /></td>
                  <td className="px-3 py-2.5"><div className="font-semibold text-slate-800">{candidate.nama}</div><div className="text-xs text-slate-500">CID: {candidate.cid || 'Belum dicatat'}</div></td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{department}</td>
                  <td className="px-3 py-2.5"><span className={'inline-flex max-w-[280px] truncate rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ring-inset ' + statusStyle(status)} title={statusText}>{statusText}</span></td>
                  <td className="px-3 py-2.5"><div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label={'Status absensi ' + candidate.nama}>{statusOptions.map(([value, label]) => {
                    const selectedTone = value === 'PRESENT' ? 'bg-emerald-600 text-white' : value === 'ABSENT' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white';
                    return <button key={value} type="button" aria-pressed={status === value} title={status === value ? 'Klik kembali untuk membatalkan status' : undefined} disabled={!editable || busy || (!academyOpen && value !== 'EXCUSED' && status !== value)} onClick={() => requestAttendanceStatus([{ candidate }], value)} className={'rounded-md px-2 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ' + (status === value ? selectedTone + ' shadow-sm' : 'text-slate-600 hover:bg-white')}>{label}</button>;
                  })}</div></td>
                </tr>;
              })}</tbody>
            </table></div>
          </section>;
        })}
      </div> : <div ref={sortableListRef} className="space-y-4">
        <p className="text-sm text-slate-600">Catat status penyerahan dan pengembalian. Setiap perubahan tersimpan pada log personel dan waktu.</p>
        {departments.map(([department, rows]) => {
          const editable = data.role === 'ADMIN' || department === data.department;
          const badgeSelectedCount = rows.filter(({ candidate }) => {
            const status = equipmentByCandidate.get(String(candidate.id));
            return status?.key_status === 'ISSUED' && status?.badge_status === 'ISSUED';
          }).length;
          const allBadgesIssued = badgeSelectedCount === rows.length;
          const sortedRows = [...rows].sort((left, right) => {
            const leftIssued = isEquipmentIssued(equipmentByCandidate.get(String(left.candidate.id))) ? 1 : 0;
            const rightIssued = isEquipmentIssued(equipmentByCandidate.get(String(right.candidate.id))) ? 1 : 0;
            return leftIssued - rightIssued || String(left.candidate.nama || '').localeCompare(String(right.candidate.nama || ''), 'id-ID', { sensitivity: 'base' });
          });
          return <section key={department} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><div className="flex items-center gap-3"><input type="checkbox" aria-label={'Tandai semua lencana ' + department} checked={allBadgesIssued} disabled={!editable || (!academyOpen && !allBadgesIssued) || Boolean(savingId)} onChange={(event) => setDepartmentBadges(rows, event.target.checked ? 'ISSUED' : 'PENDING')} className="h-4 w-4 accent-[#1E3A2B]" /><div><h4 className="text-sm font-bold text-slate-900">{department}</h4><p className="text-xs text-slate-500">{rows.length} kandidat · {editable ? 'ubah status penerimaan' : 'hanya lihat'}</p></div></div><button type="button" disabled={!editable || !academyOpen || Boolean(savingId) || allBadgesIssued} onClick={() => setDepartmentBadges(rows, 'ISSUED')} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">☑️ Tandai Semua Lencana Diberikan</button></header>
            <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2.5">Kandidat</th><th className="px-3 py-2.5">CID</th><th className="px-3 py-2.5">Status lencana</th><th className="px-3 py-2.5">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{sortedRows.map(({ candidate }) => {
            const status = equipmentByCandidate.get(String(candidate.id));
            const busy = savingId === String(candidate.id);
            const issued = isEquipmentIssued(status);
            return <tr key={candidate.id} data-sort-row={'equipment-' + candidate.id} className="hover:bg-slate-50/70"><td className="px-4 py-2.5 font-semibold text-slate-800">{candidate.nama}</td><td className="px-3 py-2.5 text-xs text-slate-500">{candidate.cid || 'Belum dicatat'}</td><td className="px-3 py-2.5"><span className={'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ' + (issued ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700')}><span aria-hidden="true">{issued ? '🟢' : '🔴'}</span>{issued ? 'Diberikan' : 'Belum Diberikan'}</span></td><td className="px-3 py-2.5"><button type="button" disabled={!editable || (!academyOpen && !issued) || busy || Boolean(savingId && !busy)} onClick={() => setEquipmentStatus(candidate.id, 'KIT', issued ? 'PENDING' : 'ISSUED')} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{issued ? 'Tandai Belum Diberikan' : 'Berikan Lencana'}</button></td></tr>;
          })}</tbody></table></div></section>;
        })}
      </div>}
      <p className="px-1 text-xs text-slate-500">Status tersinkron otomatis. Personel hanya dapat mengubah data kandidat di departemennya; admin dapat mengelola seluruh departemen.</p>
    </section>}
    {excuseDialog && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation">
      <form onSubmit={(event) => {
        event.preventDefault();
        const reason = excuseDialog.reason.trim();
        if (!reason) return;
        if (excuseDialog.bulk) void setSelectedAttendanceStatus(excuseDialog.rows, 'EXCUSED', reason);
        else void setStatus(excuseDialog.rows[0].candidate.id, 'EXCUSED', reason);
        setExcuseDialog(null);
      }} role="dialog" aria-modal="true" aria-labelledby="academy-excuse-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="academy-excuse-title" className="text-lg font-bold text-slate-900">Catat Alasan Izin</h3>
        <p className="mt-1 text-sm text-slate-500">{excuseDialog.bulk ? excuseDialog.rows.length + ' kandidat terpilih' : excuseDialog.rows[0].candidate.nama}</p>
        <label htmlFor="academy-excuse-reason" className="mt-4 block text-sm font-semibold text-slate-700">Alasan Izin <span className="text-rose-600">*</span></label>
        <textarea id="academy-excuse-reason" required maxLength={1000} autoFocus value={excuseDialog.reason} onChange={(event) => setExcuseDialog((current) => ({ ...current, reason: event.target.value }))} rows={3} placeholder="Contoh: Sakit atau ada keperluan dinas" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" />
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setExcuseDialog(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Batal</button><button type="submit" disabled={!excuseDialog.reason.trim() || Boolean(savingId)} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">Simpan Izin</button></div>
      </form>
    </div>}
  </div>;
}
