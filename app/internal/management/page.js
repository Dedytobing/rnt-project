'use client';

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BatchContext } from '../BatchContext';

function attendanceLabel(status) {
  if (status === 'PRESENT') return 'Hadir';
  if (status === 'ABSENT') return 'Tidak hadir';
  if (status === 'EXCUSED') return 'Izin';
  return 'Belum dicatat';
}

export default function RecruitmentManagementPage() {
  const { selectedBatch } = useContext(BatchContext);
  const selectedBatchId = selectedBatch?.id;
  const [data, setData] = useState({ personnel: [], candidates: [], attendance: [], groups: [], groupMembers: [], candidateGroups: [] });
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [targetGroupId, setTargetGroupId] = useState('');
  const [groupEditorOpen, setGroupEditorOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [draftPersonnelIds, setDraftPersonnelIds] = useState([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState([]);
  const [search, setSearch] = useState('');
  const [candidateFilter, setCandidateFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    if (!selectedBatchId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/internal/management?batch_id=${encodeURIComponent(selectedBatchId)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Data kelompok PIC gagal dimuat.');
      setData(result);
      setSelectedGroupId((current) => current && result.groups.some((group) => group.id === current) ? current : (result.groups[0]?.id || ''));
      setTargetGroupId((current) => current && result.groups.some((group) => group.id === current) ? current : (result.groups[0]?.id || ''));
      setSelectedCandidateIds((current) => current.filter((id) => result.candidates.some((candidate) => String(candidate.id) === id && !candidate.deleted_at)));
      setError('');
    } catch (issue) {
      setError(issue.message || 'Data kelompok PIC gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, [selectedBatchId]);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);
  useEffect(() => {
    if (!groupEditorOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !saving) setGroupEditorOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [groupEditorOpen, saving]);

  const activePersonnel = useMemo(() => data.personnel.filter((person) => person.is_active), [data.personnel]);
  const personnelById = useMemo(() => new Map(data.personnel.map((person) => [person.id, person])), [data.personnel]);
  const candidates = useMemo(() => data.candidates.filter((candidate) => !candidate.deleted_at), [data.candidates]);
  const attendanceByCandidate = useMemo(() => new Map(data.attendance.map((row) => [String(row.candidate_id), row])), [data.attendance]);
  const membersByGroup = useMemo(() => {
    const grouped = new Map();
    for (const member of data.groupMembers) {
      if (!grouped.has(member.group_id)) grouped.set(member.group_id, []);
      grouped.get(member.group_id).push(member.personnel_id);
    }
    return grouped;
  }, [data.groupMembers]);
  const candidateGroupByCandidate = useMemo(() => new Map(data.candidateGroups.map((item) => [String(item.candidate_id), item.group_id])), [data.candidateGroups]);
  const candidateCountByGroup = useMemo(() => {
    const counts = new Map();
    const activeCandidateIds = new Set(candidates.map((candidate) => String(candidate.id)));
    for (const assignment of data.candidateGroups) {
      if (activeCandidateIds.has(String(assignment.candidate_id))) counts.set(assignment.group_id, (counts.get(assignment.group_id) || 0) + 1);
    }
    return counts;
  }, [data.candidateGroups, candidates]);
  const selectedGroup = data.groups.find((group) => group.id === selectedGroupId) || null;
  const selectedGroupMembers = selectedGroup ? membersByGroup.get(selectedGroup.id) || [] : [];
  const selectedGroupCandidateCount = selectedGroup ? candidateCountByGroup.get(selectedGroup.id) || 0 : 0;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleCandidates = useMemo(() => candidates
    .filter((candidate) => candidate.nama.toLowerCase().includes(normalizedSearch))
    .filter((candidate) => {
      const hasGroup = Boolean(candidateGroupByCandidate.get(String(candidate.id)));
      return candidateFilter === 'ALL' || (candidateFilter === 'ASSIGNED' ? hasGroup : !hasGroup);
    })
    .sort((left, right) => {
      const leftAssigned = Boolean(candidateGroupByCandidate.get(String(left.id)));
      const rightAssigned = Boolean(candidateGroupByCandidate.get(String(right.id)));
      return Number(leftAssigned) - Number(rightAssigned) || left.nama.localeCompare(right.nama, 'id');
    }), [candidates, normalizedSearch, candidateFilter, candidateGroupByCandidate]);
  const selectedVisibleCount = visibleCandidates.filter((candidate) => selectedCandidateIds.includes(String(candidate.id))).length;
  const allVisibleSelected = visibleCandidates.length > 0 && selectedVisibleCount === visibleCandidates.length;
  const targetGroup = data.groups.find((group) => group.id === targetGroupId) || null;
  const targetGroupMembers = targetGroup ? membersByGroup.get(targetGroup.id) || [] : [];
  const renderCandidate = (candidate) => {
    const key = String(candidate.id);
    const currentGroupId = candidateGroupByCandidate.get(key) || '';
    const currentGroup = data.groups.find((group) => group.id === currentGroupId);
    const highlighted = Boolean(selectedGroupId && currentGroupId === selectedGroupId);
    return <label key={key} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition ${highlighted ? 'border-emerald-300 bg-emerald-50/70 ring-1 ring-emerald-200' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}>
      <input type="checkbox" checked={selectedCandidateIds.includes(key)} onChange={() => toggleCandidate(key)} className="h-4 w-4 shrink-0 accent-[#1E3A2B]" />
      <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-800">{candidate.nama}</strong><small className="mt-0.5 block text-[11px] text-slate-500">Absensi Academy: {attendanceLabel(attendanceByCandidate.get(key)?.attendance_status)}</small></span>
      <span className={`max-w-[45%] truncate rounded-full px-2.5 py-1 text-[10px] font-bold sm:text-xs ${currentGroup ? highlighted ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{currentGroup?.name || 'Belum Ada PIC'}</span>
    </label>;
  };

  const openNewGroup = () => {
    setEditingGroupId(null);
    setGroupName('');
    setDraftPersonnelIds([]);
    setGroupEditorOpen(true);
    setError('');
    setMessage('');
  };

  const openGroupEditor = (group) => {
    setSelectedGroupId(group.id);
    setTargetGroupId(group.id);
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setDraftPersonnelIds([...(membersByGroup.get(group.id) || [])]);
    setGroupEditorOpen(true);
    setError('');
    setMessage('');
  };

  const togglePersonnel = (personnelId) => {
    setDraftPersonnelIds((current) => current.includes(personnelId) ? current.filter((id) => id !== personnelId) : [...current, personnelId]);
  };

  const saveGroup = async () => {
    if (!selectedBatchId) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/internal/management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SAVE_PIC_GROUP', groupId: editingGroupId, batchId: selectedBatchId, name: groupName, personnelIds: draftPersonnelIds }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Kelompok PIC gagal disimpan.');
      setSelectedGroupId(result.groupId);
      setTargetGroupId(result.groupId);
      setGroupEditorOpen(false);
      setMessage(`Kelompok “${groupName.trim()}” berhasil disimpan.`);
      await refresh();
    } catch (issue) {
      setError(issue.message || 'Kelompok PIC gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const deleteGroup = async () => {
    if (!selectedBatchId || !selectedGroup) return;
    if (!window.confirm(`Hapus kelompok “${selectedGroup.name}”? Kandidat di dalamnya akan kembali berstatus Belum Ada PIC.`)) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/internal/management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE_PIC_GROUP', groupId: selectedGroup.id, batchId: selectedBatchId }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Kelompok PIC gagal dihapus.');
      setSelectedGroupId('');
      setTargetGroupId('');
      setMessage(`Kelompok “${selectedGroup.name}” dihapus.`);
      await refresh();
    } catch (issue) {
      setError(issue.message || 'Kelompok PIC gagal dihapus.');
    } finally {
      setSaving(false);
    }
  };

  const toggleCandidate = (candidateId) => {
    const key = String(candidateId);
    setSelectedCandidateIds((current) => current.includes(key) ? current.filter((id) => id !== key) : [...current, key]);
  };

  const toggleVisibleCandidates = (checked) => {
    const visibleIds = visibleCandidates.map((candidate) => String(candidate.id));
    setSelectedCandidateIds((current) => checked
      ? [...new Set([...current, ...visibleIds])]
      : current.filter((id) => !visibleIds.includes(id)));
  };

  const assignSelectedCandidates = async () => {
    if (!selectedBatchId || !selectedCandidateIds.length || !targetGroupId) return;
    setBulkSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/internal/management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SET_CANDIDATE_GROUPS_BULK', candidateIds: selectedCandidateIds, batchId: selectedBatchId, groupId: targetGroupId }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Pemindahan kandidat gagal disimpan.');
      setMessage(`${result.updatedCount || selectedCandidateIds.length} kandidat ditetapkan ke ${targetGroup?.name || 'kelompok terpilih'}.`);
      setSelectedCandidateIds([]);
      await refresh();
    } catch (issue) {
      setError(issue.message || 'Pemindahan kandidat gagal disimpan.');
    } finally {
      setBulkSaving(false);
    }
  };

  if (!selectedBatch) return <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm"><h2 className="text-lg font-bold text-slate-900">Pilih batch terlebih dahulu</h2><p className="mt-2 text-sm text-slate-500">Manajemen kelompok PIC dikelola per batch.</p></section>;

  return <div className="space-y-5 pb-24">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1E3A2B]">Manajemen Kelompok PIC Academy</p><h2 className="mt-1 text-2xl font-bold text-slate-900">{selectedBatch.name}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Kelola personel per kelompok di sebelah kiri. Pilih kandidat di panel kanan dan tetapkan beberapa kandidat ke satu kelompok dalam satu aksi.</p></div><span className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-[#1E3A2B]">{candidates.length} kandidat · {activePersonnel.length} personel aktif</span></div>
    </section>
    {(error || message) && <div role={error ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || message}</div>}

    <div className="grid items-start gap-4 xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.5fr)]">
      <section className="space-y-3 xl:sticky xl:top-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[#1E3A2B]">Panel Kelompok</p><h3 className="mt-1 text-lg font-bold text-slate-900">Kelompok PIC</h3></div><button type="button" onClick={openNewGroup} className="rounded-lg bg-[#1E3A2B] px-3 py-2 text-xs font-bold text-white hover:bg-[#294d39]">+ Kelompok</button></div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Pilih kartu untuk menyorot anggotanya di daftar kandidat.</p>
          <div className="mt-4 space-y-2">
            {data.groups.map((group) => {
              const memberIds = membersByGroup.get(group.id) || [];
              const selected = group.id === selectedGroupId;
              return <article key={group.id} className={`rounded-xl border p-3 transition ${selected ? 'border-[#1E3A2B] bg-emerald-50/60 ring-1 ring-[#1E3A2B]/10' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <button type="button" onClick={() => { setSelectedGroupId(group.id); setTargetGroupId(group.id); setGroupEditorOpen(false); setMessage(''); }} className="w-full text-left">
                  <div className="flex items-start justify-between gap-2"><strong className="min-w-0 truncate text-sm text-slate-800">{group.name}</strong><span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">{candidateCountByGroup.get(group.id) || 0} kandidat</span></div>
                  <div className="mt-2 flex flex-wrap gap-1">{memberIds.length ? memberIds.map((id) => <span key={id} className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] text-slate-600 ring-1 ring-slate-200">{personnelById.get(id)?.full_name || 'Personel tidak aktif'}</span>) : <span className="text-[11px] italic text-amber-700">Belum ada anggota</span>}</div>
                </button>
                <button type="button" onClick={() => openGroupEditor(group)} className="mt-1 rounded-md px-2 py-1 text-xs font-medium text-[#1E3A2B] hover:bg-white hover:underline">Edit anggota</button>
              </article>;
            })}
            {!data.groups.length && !loading && <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">Belum ada kelompok PIC di batch ini.</div>}
          </div>

        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-[#1E3A2B]">Panel Kandidat</p><h3 className="mt-1 text-lg font-bold text-slate-900">Semua kandidat · {candidates.length}</h3><p className="mt-1 text-xs text-slate-500">{selectedGroup ? `Kandidat dalam ${selectedGroup.name} disorot.` : 'Pilih kelompok di kiri untuk menyorot kandidatnya.'}</p></div><label className="w-full sm:max-w-xs"><span className="mb-1 block text-[11px] font-semibold text-slate-500">Cari kandidat</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ketik nama kandidat…" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1E3A2B]" /></label></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2" aria-label="Filter kandidat">
              {[['ALL', 'Semua', candidates.length], ['UNASSIGNED', 'Belum Ada PIC', candidates.filter((candidate) => !candidateGroupByCandidate.get(String(candidate.id))).length], ['ASSIGNED', 'Sudah Ada PIC', candidates.filter((candidate) => candidateGroupByCandidate.get(String(candidate.id))).length]].map(([value, label, count]) => <button key={value} type="button" aria-pressed={candidateFilter === value} onClick={() => setCandidateFilter(value)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${candidateFilter === value ? 'border-[#1E3A2B] bg-[#1E3A2B] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-[#1E3A2B] hover:text-[#1E3A2B]'}`}><span>{label}</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${candidateFilter === value ? 'bg-white/15 text-emerald-100' : 'bg-slate-100 text-slate-500'}`}>{count}</span></button>)}
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={allVisibleSelected} onChange={(event) => toggleVisibleCandidates(event.target.checked)} className="h-4 w-4 accent-[#1E3A2B]" />Pilih semua ({visibleCandidates.length})</label>
          </div>
        </div>
        {loading ? <div className="p-14 text-center text-sm text-slate-500">Memuat seluruh kandidat batch…</div> : <div className="space-y-2 p-3 sm:p-4">
          {visibleCandidates.length ? <>
            {candidateFilter !== 'ASSIGNED' && visibleCandidates.some((candidate) => !candidateGroupByCandidate.get(String(candidate.id))) && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">Belum Ada PIC <span className="font-medium text-amber-700">· {visibleCandidates.filter((candidate) => !candidateGroupByCandidate.get(String(candidate.id))).length} kandidat</span></div>}
            {visibleCandidates.filter((candidate) => !candidateGroupByCandidate.get(String(candidate.id))).map((candidate) => renderCandidate(candidate))}
            {candidateFilter === 'ALL' && visibleCandidates.some((candidate) => candidateGroupByCandidate.get(String(candidate.id))) && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900">Sudah Ada PIC <span className="font-medium text-emerald-700">· {visibleCandidates.filter((candidate) => candidateGroupByCandidate.get(String(candidate.id))).length} kandidat</span></div>}
            {visibleCandidates.filter((candidate) => candidateGroupByCandidate.get(String(candidate.id))).map((candidate) => renderCandidate(candidate))}
          </> : <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">Tidak ada kandidat yang cocok dengan filter.</div>}
        </div>}
      </section>
    </div>

    {selectedCandidateIds.length > 0 && <div className="fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur sm:inset-x-auto sm:bottom-6 sm:w-[min(90vw,760px)] sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3">
      <div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1E3A2B] text-sm font-bold text-white">{selectedCandidateIds.length}</span><span><strong className="block text-sm text-slate-900">Kandidat dipilih</strong><small className="text-xs text-slate-500">Tetapkan seluruh pilihan ke satu kelompok</small></span></div>
      <div className="flex gap-2"><select value={targetGroupId} onChange={(event) => setTargetGroupId(event.target.value)} aria-label="Kelompok tujuan" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#1E3A2B] sm:max-w-64">{data.groups.map((group) => <option key={group.id} value={group.id} disabled={!(membersByGroup.get(group.id) || []).length}>{group.name}{!(membersByGroup.get(group.id) || []).length ? ' · belum ada anggota' : ''}</option>)}</select><button type="button" disabled={bulkSaving || !targetGroup || !targetGroupMembers.length} onClick={assignSelectedCandidates} className="shrink-0 rounded-lg bg-[#1E3A2B] px-3 py-2 text-xs font-bold text-white hover:bg-[#294d39] disabled:cursor-not-allowed disabled:opacity-50">{bulkSaving ? 'Memindahkan…' : 'Tetapkan ke Kelompok PIC'}</button><button type="button" onClick={() => setSelectedCandidateIds([])} aria-label="Batalkan pilihan" className="rounded-lg px-2 py-2 text-slate-500 hover:bg-slate-100">×</button></div>
    </div>}

    {groupEditorOpen && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setGroupEditorOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="pic-group-modal-title" className="my-auto flex max-h-[min(90vh,800px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="border-b border-slate-100 px-5 py-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[#1E3A2B]">Manajemen Kelompok PIC</p><h3 id="pic-group-modal-title" className="mt-1 text-xl font-bold text-slate-900">{editingGroupId ? 'Edit kelompok' : 'Tambah kelompok'}</h3></div><button type="button" disabled={saving} onClick={() => setGroupEditorOpen(false)} aria-label="Tutup modal" className="rounded-lg px-2.5 py-1.5 text-xl leading-none text-slate-500 hover:bg-slate-100 disabled:opacity-50">×</button></div></header>
        <div className="space-y-4 overflow-y-auto p-5">
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>}
          <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Nama kelompok</span><input autoFocus value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={100} placeholder="Contoh: Kelompok PIC A" className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-[#1E3A2B] focus:ring-2 focus:ring-[#1E3A2B]/10" /></label>
          <div><div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold text-slate-700">Anggota staff/personel</span><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-[#1E3A2B]">{draftPersonnelIds.length} dipilih</span></div>
            {activePersonnel.length ? <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">{activePersonnel.map((person) => <label key={person.id} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition ${draftPersonnelIds.includes(person.id) ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}><input type="checkbox" checked={draftPersonnelIds.includes(person.id)} onChange={() => togglePersonnel(person.id)} className="h-4 w-4 shrink-0 accent-[#1E3A2B]" /><span className="min-w-0"><strong className="block truncate text-sm text-slate-800">{person.full_name}</strong><small className="text-xs text-slate-500">{person.role === 'ADMIN' ? 'Admin Team RNT' : 'Staff'}</small></span></label>)}</div> : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Tidak ada personel aktif.</p>}
          </div>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4"><div>{editingGroupId && <button type="button" disabled={saving} onClick={deleteGroup} className="rounded-lg px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Hapus kelompok</button>}</div><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => setGroupEditorOpen(false)} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Batal</button><button type="button" disabled={saving || !groupName.trim()} onClick={saveGroup} className="rounded-lg bg-[#1E3A2B] px-4 py-2 text-sm font-bold text-white hover:bg-[#294d39] disabled:opacity-50">{saving ? 'Menyimpan…' : 'Simpan kelompok'}</button></div></footer>
      </section>
    </div>}
  </div>;
}
