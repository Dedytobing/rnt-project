'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BatchContext } from '../BatchContext';

function formatTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(value));
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
  const [data, setData] = useState({ candidates: [], batches: [], attendance: [], groups: [], groupMembers: [], candidateGroups: [], personnel: [], role: 'STAFF', personnelId: '' });
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
      const response = await fetch(`/api/internal/academy?batch_id=${encodeURIComponent(selectedBatchId)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Daftar Academy gagal dimuat.');
      setData(result);
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
  const personnelNames = useMemo(() => new Map((data.personnel || []).map((person) => [person.id, person.full_name])), [data.personnel]);
  const groupById = useMemo(() => new Map(data.groups.map((group) => [group.id, group])), [data.groups]);
  const membersByGroup = useMemo(() => {
    const grouped = new Map();
    for (const member of data.groupMembers || []) {
      if (!grouped.has(member.group_id)) grouped.set(member.group_id, []);
      grouped.get(member.group_id).push(member.personnel_id);
    }
    return grouped;
  }, [data.groupMembers]);
  const groupByCandidate = useMemo(() => new Map((data.candidateGroups || []).map((assignment) => [String(assignment.candidate_id), assignment.group_id])), [data.candidateGroups]);

  const setStatus = async (candidateId, status) => {
    const key = String(candidateId);
    const previous = data.attendance.find((row) => String(row.candidate_id) === key);
    setError('');
    setMessage('');
    setSavingId(key);
    setData((current) => ({
      ...current,
      attendance: current.attendance.map((row) => String(row.candidate_id) === key ? { ...row, attendance_status: status, updated_by: 'Menyimpan…', updated_at: new Date().toISOString() } : row),
    }));
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

  const candidateRows = useMemo(() => data.candidates.map((candidate) => ({
    candidate,
    attendance: attendanceByCandidate.get(String(candidate.id)),
    groupId: groupByCandidate.get(String(candidate.id)) || null,
  })), [data.candidates, attendanceByCandidate, groupByCandidate]);
  const presentCount = candidateRows.filter(({ attendance }) => attendance?.attendance_status === 'PRESENT').length;
  const assignedCount = candidateRows.filter(({ groupId }) => groupId).length;
  const groups = useMemo(() => {
    const grouped = new Map();
    for (const row of candidateRows) {
      const groupId = row.groupId || '__unassigned__';
      const group = groupById.get(groupId);
      if (!grouped.has(groupId)) grouped.set(groupId, { groupId, groupName: group?.name || 'Belum masuk kelompok', memberIds: membersByGroup.get(groupId) || [], rows: [] });
      grouped.get(groupId).rows.push(row);
    }
    return [...grouped.values()].sort((a, b) => {
      const aOwn = a.memberIds.includes(data.personnelId);
      const bOwn = b.memberIds.includes(data.personnelId);
      if (aOwn !== bOwn) return aOwn ? -1 : 1;
      return a.groupName.localeCompare(b.groupName, 'id');
    });
  }, [candidateRows, data.personnelId, groupById, membersByGroup]);
  const ownGroups = groups.filter((group) => group.memberIds.includes(data.personnelId));
  const otherGroups = groups.filter((group) => !group.memberIds.includes(data.personnelId));

  const renderCandidateCard = ({ candidate, attendance }, interactive) => {
    const status = attendance?.attendance_status || 'PENDING';
    const busy = savingId === String(candidate.id);
    return <article key={candidate.id} className={`rounded-xl border p-2.5 transition ${interactive ? 'border-emerald-200 bg-white shadow-sm shadow-emerald-900/5' : 'border-slate-200 bg-slate-100/80 opacity-80 grayscale-[0.18]'}`}>
      <div className="flex min-w-0 items-center gap-2">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${interactive ? 'bg-[#1E3A2B] text-white' : 'bg-slate-300 text-slate-600'}`}>{candidate.nama.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{candidate.nama}</strong></div>
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
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1E3A2B]">Academy · {selectedBatch?.name || 'Batch belum dipilih'}</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Absensi Kandidat</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">PIC dapat mencentang kehadiran secara langsung. Rekap akan diperbarui otomatis untuk personel lain yang membuka batch ini.</p></div><div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${realtimeConnected ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}><span className={`h-2.5 w-2.5 rounded-full ${realtimeConnected ? 'animate-pulse bg-emerald-600' : 'bg-amber-500'}`}/>{realtimeConnected ? 'LIVE · tersambung' : 'Sinkronisasi otomatis'}</div></div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl border border-slate-100 p-3"><small className="text-xs text-slate-500">Kandidat</small><strong className="mt-1 block text-xl text-slate-900">{data.candidates.length}</strong></div><div className="rounded-xl border border-slate-100 p-3"><small className="text-xs text-slate-500">Sudah ditugaskan</small><strong className="mt-1 block text-xl text-slate-900">{assignedCount}</strong></div><div className="rounded-xl border border-slate-100 p-3"><small className="text-xs text-slate-500">Hadir</small><strong className="mt-1 block text-xl text-emerald-700">{presentCount}</strong></div><div className="rounded-xl border border-slate-100 p-3"><small className="text-xs text-slate-500">Terakhir sinkron</small><strong className="mt-1 block text-sm text-slate-800">{lastSyncedAt ? formatTime(lastSyncedAt) : 'Memuat…'}</strong></div></div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{message && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    </section>

    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Memuat daftar absensi…</div> : <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"><div><h3 className="font-bold text-slate-900">Kelompok PIC</h3><p className="mt-1 text-xs text-slate-500">Jadwal Academy: {formatTime(data.batches[0]?.academy_start)} – {formatTime(data.batches[0]?.academy_end)}</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{data.role === 'ADMIN' ? 'Admin · absensi aktif bila menjadi PIC' : 'Staff · hanya dapat mengubah kelompok sendiri'}</span></div>
      {!candidateRows.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Belum ada kandidat pada batch ini.</div> : <div className={`grid items-start gap-4 ${ownGroups.length || data.role === 'STAFF' ? 'xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]' : ''}`}>
        {(ownGroups.length > 0 || data.role === 'STAFF') && <section className="space-y-3 rounded-2xl border border-emerald-300 bg-emerald-50/70 p-3 shadow-sm shadow-emerald-900/5">
          <div className="flex items-center justify-between gap-2"><div><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-800">Kelompok Anda</p><h4 className="mt-0.5 text-base font-bold text-[#1E3A2B]">{personnelNames.get(data.personnelId) || 'PIC aktif'}</h4></div><span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">{ownGroups.reduce((sum, group) => sum + group.rows.length, 0)} kandidat</span></div>
          {ownGroups.length ? ownGroups.map((group) => <section key={group.groupId} className="rounded-xl border border-emerald-200 bg-white/80 p-3">
            <div className="mb-2 flex items-center justify-between gap-2"><h5 className="text-sm font-bold text-[#1E3A2B]">{group.groupName}</h5><span className="text-[11px] text-slate-500">{group.rows.length} kandidat</span></div>
            {group.rows.length ? <div className="grid gap-2 sm:grid-cols-2">{group.rows.map((row) => renderCandidateCard(row, true))}</div> : <p className="text-xs text-slate-500">Belum ada kandidat dalam kelompok ini.</p>}
          </section>) : <div className="rounded-xl border border-dashed border-emerald-300 bg-white/70 p-5 text-center text-sm text-emerald-900/70">Anda belum tergabung dalam kelompok PIC untuk batch ini.</div>}
        </section>}
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-3 flex items-center justify-between gap-2"><div><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">{data.role === 'ADMIN' ? 'Rekap kelompok' : 'Transparansi tim'}</p><h4 className="mt-0.5 text-base font-bold text-slate-700">{data.role === 'ADMIN' ? 'Kelompok PIC lain' : 'Kelompok lain'}</h4></div><span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">{otherGroups.reduce((sum, group) => sum + group.rows.length, 0)} kandidat</span></div>
          {otherGroups.length ? <div className="space-y-3">{otherGroups.map((group) => {
            const countPresent = group.rows.filter(({ attendance }) => attendance?.attendance_status === 'PRESENT').length;
            return <section key={group.groupId} className="rounded-2xl border border-slate-200 bg-white/75 p-3">
              <div className="mb-2"><div className="flex items-center justify-between gap-2"><h5 className="truncate text-sm font-bold text-slate-700">{group.groupName}</h5><p className="shrink-0 text-[11px] text-slate-500">{countPresent}/{group.rows.length} hadir</p></div><div className="mt-1 flex flex-wrap gap-1">{group.memberIds.map((id) => <span key={id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{personnelNames.get(id) || 'Personel tidak aktif'}</span>)}</div></div>
              <div className="grid gap-2">{group.rows.map((row) => renderCandidateCard(row, false))}</div>
            </section>;
          })}</div> : <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-7 text-center text-sm text-slate-500">Belum ada kelompok PIC lain untuk ditampilkan.</div>}
        </section>
      </div>}
      <p className="px-1 text-xs text-slate-400">Status kelompok lain diperbarui otomatis secara real-time; sinkronisasi berkala menjadi cadangan. Hanya PIC yang ditunjuk dapat mengubah absensi kandidatnya.</p>
    </section>}
  </div>;
}
