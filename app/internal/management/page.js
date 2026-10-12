'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BatchContext } from '../BatchContext';
import { parseWhitelistRoster } from '@/lib/whitelist-parser';

function attendanceLabel(status) {
  if (status === 'PRESENT') return 'Hadir';
  if (status === 'ABSENT') return 'Tidak hadir';
  if (status === 'EXCUSED') return 'Izin';
  return 'Belum dicatat';
}

function TablePagination({ page, total, onPageChange }) {
  const pageCount = Math.max(1, Math.ceil(total / 10));
  return <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3 text-xs">
    <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
    <span className="min-w-24 text-center font-medium text-slate-600">Halaman {page} dari {pageCount}</span>
    <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
  </div>;
}

function RoleFilterHeader({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const options = [
    ['ALL', 'Semua'],
    ['STAFF', 'Staff'],
    ['ADMIN', 'Admin'],
  ];

  useEffect(() => {
    if (!open) return undefined;
    const closeMenu = (event) => {
      if (event.type === 'keydown' && event.key === 'Escape') setOpen(false);
      if (event.type === 'mousedown' && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeMenu);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeMenu);
    };
  }, [open, rootRef]);

  return <div ref={rootRef} className="relative flex items-center gap-1.5">
    <span>Peran</span>
    <button type="button" aria-label="Filter berdasarkan peran" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={`grid h-6 w-6 place-items-center rounded-md transition ${value !== 'ALL' ? 'bg-emerald-100 text-emerald-800' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800'}`}>
      <span aria-hidden="true" className={`text-[11px] transition-transform ${open ? 'rotate-180' : ''}`}>⏷</span>
    </button>
    {open && <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-36 rounded-lg border border-slate-200 bg-white p-1.5 text-left normal-case tracking-normal shadow-xl">
      {options.map(([option, label]) => <button key={option} type="button" role="menuitemradio" aria-checked={value === option} onClick={() => { onChange(option); setOpen(false); }} className={`block w-full rounded-md px-3 py-2 text-left text-xs font-semibold transition ${value === option ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-slate-50'}`}>
        <span className="flex items-center justify-between">{label}{value === option && <span aria-hidden="true">✓</span>}</span>
      </button>)}
    </div>}
  </div>;
}

export default function RecruitmentManagementPage() {
  const { selectedBatch } = useContext(BatchContext);
  const selectedBatchId = selectedBatch?.id;
  const [data, setData] = useState({ personnel: [], whitelist: [], candidates: [], attendance: [], groups: [], groupMembers: [], candidateGroups: [] });
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
  const [activeModule, setActiveModule] = useState('groups');
  const [showDeletedCandidates, setShowDeletedCandidates] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [editingPersonnel, setEditingPersonnel] = useState(null);
  const [personnelModalTab, setPersonnelModalTab] = useState('single');
  const [bulkWhitelistText, setBulkWhitelistText] = useState('');
  const [bulkWhitelistPreview, setBulkWhitelistPreview] = useState(null);
  const [bulkDefaultRole, setBulkDefaultRole] = useState('STAFF');
  const [editingWhitelist, setEditingWhitelist] = useState(null);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidatePage, setCandidatePage] = useState(1);
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [personnelRoleFilter, setPersonnelRoleFilter] = useState('ALL');
  const [personnelPage, setPersonnelPage] = useState(1);
  const [whitelistSearch, setWhitelistSearch] = useState('');
  const [whitelistRoleFilter, setWhitelistRoleFilter] = useState('ALL');
  const [whitelistPage, setWhitelistPage] = useState(1);

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
  const pendingWhitelist = useMemo(() => {
    const profiles = new Set(data.personnel.map((person) => person.normalized_name));
    return data.whitelist.filter((item) => item.is_active && !profiles.has(item.normalized_name));
  }, [data.personnel, data.whitelist]);
  const searchedPersonnel = useMemo(() => data.personnel.filter((person) => `${person.full_name} ${person.department || ''}`.toLocaleLowerCase('id-ID').includes(personnelSearch.trim().toLocaleLowerCase('id-ID')) && (personnelRoleFilter === 'ALL' || person.role === personnelRoleFilter)), [data.personnel, personnelSearch, personnelRoleFilter]);
  const currentPersonnelPage = Math.min(personnelPage, Math.max(1, Math.ceil(searchedPersonnel.length / 10)));
  const visiblePersonnelPage = useMemo(() => searchedPersonnel.slice((currentPersonnelPage - 1) * 10, currentPersonnelPage * 10), [searchedPersonnel, currentPersonnelPage]);
  const searchedWhitelist = useMemo(() => pendingWhitelist.filter((item) => item.full_name.toLocaleLowerCase('id-ID').includes(whitelistSearch.trim().toLocaleLowerCase('id-ID')) && (whitelistRoleFilter === 'ALL' || item.role === whitelistRoleFilter)), [pendingWhitelist, whitelistSearch, whitelistRoleFilter]);
  const currentWhitelistPage = Math.min(whitelistPage, Math.max(1, Math.ceil(searchedWhitelist.length / 10)));
  const visibleWhitelistPage = useMemo(() => searchedWhitelist.slice((currentWhitelistPage - 1) * 10, currentWhitelistPage * 10), [searchedWhitelist, currentWhitelistPage]);
  const personnelById = useMemo(() => new Map(data.personnel.map((person) => [person.id, person])), [data.personnel]);
  const candidates = useMemo(() => data.candidates.filter((candidate) => !candidate.deleted_at), [data.candidates]);
  const moduleCandidates = useMemo(() => data.candidates.filter((candidate) => Boolean(candidate.deleted_at) === showDeletedCandidates), [data.candidates, showDeletedCandidates]);
  const searchedCandidates = useMemo(() => moduleCandidates.filter((candidate) => candidate.nama.toLocaleLowerCase('id-ID').includes(candidateSearch.trim().toLocaleLowerCase('id-ID'))), [moduleCandidates, candidateSearch]);
  const currentCandidatePage = Math.min(candidatePage, Math.max(1, Math.ceil(searchedCandidates.length / 10)));
  const visibleCandidatesPage = useMemo(() => searchedCandidates.slice((currentCandidatePage - 1) * 10, currentCandidatePage * 10), [searchedCandidates, currentCandidatePage]);
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
      <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-800">{candidate.nama}</strong><small className="management-attendance-status mt-0.5 block text-[11px] text-slate-500">Absensi Academy: {attendanceLabel(attendanceByCandidate.get(key)?.attendance_status)}</small></span>
      <span className={`management-candidate-group-badge max-w-[45%] truncate rounded-full px-2.5 py-1 text-[10px] font-bold sm:text-xs ${currentGroup ? highlighted ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{currentGroup?.name || 'Belum Ada PIC'}</span>
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

  const postManagement = async (payload) => {
    const response = await fetch('/api/internal/management', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Perubahan gagal disimpan.');
    return result;
  };

  const changeCandidateState = async (candidate, action) => {
    const deleting = action === 'SOFT_DELETE';
    if (!window.confirm(deleting ? `Hapus data kandidat ${candidate.nama}? Data masih dapat dipulihkan.` : `Pulihkan data kandidat ${candidate.nama}?`)) return;
    setSaving(true); setError(''); setMessage('');
    try { await postManagement({ action, candidateId: String(candidate.id), batchId: selectedBatchId }); setMessage(deleting ? 'Data kandidat dipindahkan ke Terhapus.' : 'Data kandidat berhasil dipulihkan.'); await refresh(); }
    catch (issue) { setError(issue.message || 'Perubahan kandidat gagal disimpan.'); }
    finally { setSaving(false); }
  };

  const saveCandidate = async (event) => {
    event.preventDefault(); if (!editingCandidate) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/candidates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ADMIN_OVERRIDE_CANDIDATE', id: String(editingCandidate.id), nama: editingCandidate.nama, linkCv: editingCandidate.link_cv, statusCv: editingCandidate.status_cv || 'Pending', mdtCheck: editingCandidate.mdt_check || '', statusInterview: editingCandidate.status_interview || 'Pending', catatan: editingCandidate.catatan || '', notesInvestigator: editingCandidate.notes_investigator || '', notesInterviewer: editingCandidate.notes_interviewer || '' }) });
      const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Perubahan kandidat gagal disimpan.');
      setEditingCandidate(null); setMessage('Data kandidat berhasil diperbarui.'); await refresh();
    } catch (issue) { setError(issue.message || 'Perubahan kandidat gagal disimpan.'); }
    finally { setSaving(false); }
  };

  const savePersonnel = async (event) => {
    event.preventDefault(); if (!editingPersonnel) return;
    setSaving(true); setError(''); setMessage('');
    try {
      if (editingPersonnel.personnelId) {
        await postManagement({ action: 'SAVE_PERSONNEL', ...editingPersonnel });
        setMessage('Profil dan akses personel berhasil diperbarui.');
      } else {
        await postManagement({ action: 'ADD_WHITELIST', fullName: editingPersonnel.fullName, role: editingPersonnel.role });
        setMessage('Nama berhasil ditambahkan ke whitelist. Staff akan melengkapi profil saat login.');
      }
      setEditingPersonnel(null); await refresh();
    }
    catch (issue) { setError(issue.message || 'Akses personel gagal disimpan.'); }
    finally { setSaving(false); }
  };

  const saveBulkWhitelist = async (event) => {
    event.preventDefault();
    const entries = bulkWhitelistPreview?.rows.map(({ fullName, role }) => ({ fullName, role })) || [];
    if (!entries.length) { setError('Buat pratinjau dan pastikan ada nama valid sebelum menyimpan.'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await postManagement({ action: 'BULK_WHITELIST', entries });
      setEditingPersonnel(null); setBulkWhitelistText(''); setBulkWhitelistPreview(null); setMessage(`${result.savedCount} nama berhasil ditambahkan atau diperbarui di whitelist.`); await refresh();
    } catch (issue) { setError(issue.message || 'Input massal gagal disimpan.'); }
    finally { setSaving(false); }
  };

  const previewBulkWhitelist = () => {
    const { rows: parsedRows, vacantCount, skippedCount } = parseWhitelistRoster(bulkWhitelistText);
    const role = editingPersonnel?.role || bulkDefaultRole;
    const rows = parsedRows.map((row) => ({ ...row, role }));
    if (!rows.length) { setError('Tidak ditemukan nama valid. Periksa daftar lalu coba lagi.'); setBulkWhitelistPreview(null); return; }
    setError(''); setBulkWhitelistPreview({ rows, vacantCount, skippedCount });
  };

  const deletePersonnel = async (person) => {
    if (!window.confirm(`Hapus akses personel ${person.full_name}? Akun akan dinonaktifkan dan dapat ditambahkan kembali.`)) return;
    setSaving(true); setError('');
    try { await postManagement({ action: 'DELETE_PERSONNEL', personnelId: person.id }); setMessage(`Akses ${person.full_name} dinonaktifkan.`); await refresh(); }
    catch (issue) { setError(issue.message || 'Akses personel gagal dihapus.'); }
    finally { setSaving(false); }
  };

  const saveWhitelistRole = async () => {
    if (!editingWhitelist) return;
    setSaving(true); setError(''); setMessage('');
    try { await postManagement({ action: 'UPDATE_WHITELIST_ROLE', whitelistId: editingWhitelist.id, role: editingWhitelist.role }); setEditingWhitelist(null); setMessage('Peran whitelist berhasil diperbarui.'); await refresh(); }
    catch (issue) { setError(issue.message || 'Peran whitelist gagal diperbarui.'); }
    finally { setSaving(false); }
  };

  const deleteWhitelist = async (item) => {
    if (!window.confirm(`Cabut whitelist untuk ${item.full_name}? Nama ini tidak dapat login sampai ditambahkan kembali.`)) return;
    setSaving(true); setError(''); setMessage('');
    try { await postManagement({ action: 'DELETE_WHITELIST', whitelistId: item.id }); setMessage(`Whitelist ${item.full_name} berhasil dicabut.`); await refresh(); }
    catch (issue) { setError(issue.message || 'Whitelist gagal dicabut.'); }
    finally { setSaving(false); }
  };

  if (!selectedBatch) return <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm"><h2 className="text-lg font-bold text-slate-900">Pilih batch terlebih dahulu</h2><p className="mt-2 text-sm text-slate-500">Manajemen kelompok PIC dikelola per batch.</p></section>;

  return <div className="management-page space-y-5 pb-24">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="management-eyebrow text-xs font-bold uppercase tracking-[0.16em] text-[#1E3A2B]">Manajemen Kelompok PIC Academy</p><h2 className="mt-1 text-2xl font-bold text-slate-900">{selectedBatch.name}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Kelola personel per kelompok di sebelah kiri. Pilih kandidat di panel kanan dan tetapkan beberapa kandidat ke satu kelompok dalam satu aksi.</p></div><span className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-[#1E3A2B]">{candidates.length} kandidat · {activePersonnel.length} personel aktif</span></div>
    </section>
    <section aria-label="Sub-menu manajemen" className="grid gap-3 sm:grid-cols-3">
      {[
        ['groups', 'Kelompok PIC', `${data.groups.length} kelompok`, 'Atur personel dan assignment kandidat'],
        ['candidates', 'Data Kandidat', `${data.candidates.length} data`, 'Edit, hapus, dan pulihkan kandidat'],
        ['personnel', 'Akses Staff', `${activePersonnel.length} personel aktif`, 'Kelola identitas, PIN, dan peran'],
      ].map(([key, title, count, description]) => <button key={key} type="button" aria-pressed={activeModule === key} onClick={() => { setActiveModule(key); setError(''); setMessage(''); }} className={`management-module-card rounded-2xl border-2 p-4 text-left shadow-sm transition ${activeModule === key ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 bg-white hover:border-emerald-300'}`}><span className="flex items-center justify-between gap-2"><strong className="text-sm font-bold text-slate-900">{title}</strong>{activeModule === key && <span className="rounded-full bg-emerald-700 px-2 py-1 text-[10px] font-bold text-white">Aktif</span>}</span><span className="mt-2 block text-xs font-semibold text-[#1E3A2B]">{count}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span></button>)}
    </section>
    {(error || message) && <div role={error ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || message}</div>}

    {activeModule === 'groups' && <div className="grid items-start gap-4 xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.5fr)]">
      <section className="space-y-3 xl:sticky xl:top-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3"><div><p className="management-panel-eyebrow text-xs font-bold uppercase tracking-wider text-[#1E3A2B]">Panel Kelompok</p><h3 className="mt-1 text-lg font-bold text-slate-900">Kelompok PIC</h3></div><button type="button" onClick={openNewGroup} className="rounded-lg bg-[#1E3A2B] px-3 py-2 text-xs font-bold text-white hover:bg-[#294d39]">+ Kelompok</button></div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Pilih kartu untuk menyorot anggotanya di daftar kandidat.</p>
          <div className="mt-4 space-y-2">
            {data.groups.map((group) => {
              const memberIds = membersByGroup.get(group.id) || [];
              const selected = group.id === selectedGroupId;
              return <article key={group.id} className={`rounded-xl border p-3 transition ${selected ? 'border-[#1E3A2B] bg-emerald-50/60 ring-1 ring-[#1E3A2B]/10' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <button type="button" onClick={() => { setSelectedGroupId(group.id); setTargetGroupId(group.id); setGroupEditorOpen(false); setMessage(''); }} className="w-full text-left">
                  <div className="flex items-start justify-between gap-2"><strong className="min-w-0 truncate text-sm text-slate-800">{group.name}</strong><span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">{candidateCountByGroup.get(group.id) || 0} kandidat</span></div>
                  <div className="mt-2 flex flex-wrap gap-1">{memberIds.length ? memberIds.map((id) => <span key={id} className="management-pic-member-pill rounded-full bg-white/80 px-2 py-0.5 text-[10px] text-slate-600 ring-1 ring-slate-200">{personnelById.get(id)?.full_name || 'Personel tidak aktif'}</span>) : <span className="text-[11px] italic text-amber-700">Belum ada anggota</span>}</div>
                </button>
                <button type="button" onClick={() => openGroupEditor(group)} className="management-edit-members mt-1 rounded-md px-2 py-1 text-xs font-medium text-[#1E3A2B] hover:bg-white hover:underline">Edit anggota</button>
              </article>;
            })}
            {!data.groups.length && !loading && <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">Belum ada kelompok PIC di batch ini.</div>}
          </div>

        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="management-panel-eyebrow text-xs font-bold uppercase tracking-wider text-[#1E3A2B]">Panel Kandidat</p><h3 className="mt-1 text-lg font-bold text-slate-900">Semua kandidat · {candidates.length}</h3><p className="mt-1 text-xs text-slate-500">{selectedGroup ? `Kandidat dalam ${selectedGroup.name} disorot.` : 'Pilih kelompok di kiri untuk menyorot kandidatnya.'}</p></div><label className="w-full sm:max-w-xs"><span className="mb-1 block text-[11px] font-semibold text-slate-500">Cari kandidat</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ketik nama kandidat…" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1E3A2B]" /></label></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2" aria-label="Filter kandidat">
              {[['ALL', 'Semua', candidates.length], ['UNASSIGNED', 'Belum Ada PIC', candidates.filter((candidate) => !candidateGroupByCandidate.get(String(candidate.id))).length], ['ASSIGNED', 'Sudah Ada PIC', candidates.filter((candidate) => candidateGroupByCandidate.get(String(candidate.id))).length]].map(([value, label, count]) => <button key={value} type="button" aria-pressed={candidateFilter === value} onClick={() => setCandidateFilter(value)} className={`management-filter-tab inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${candidateFilter === value ? 'border-[#1E3A2B] bg-[#1E3A2B] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-[#1E3A2B] hover:text-[#1E3A2B]'}`}><span>{label}</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${candidateFilter === value ? 'bg-white/15 text-emerald-100' : 'bg-slate-100 text-slate-500'}`}>{count}</span></button>)}
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
    </div>}

    {activeModule === 'candidates' && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><h3 className="text-lg font-bold text-slate-900">Data Kandidat</h3><p className="mt-1 text-xs text-slate-500">Edit informasi dasar; penghapusan bersifat lunak dan bisa dipulihkan.</p></div><div className="flex flex-wrap items-end gap-3"><label className="block"><span className="mb-1 block text-[11px] font-semibold text-slate-500">Cari nama kandidat</span><input type="search" value={candidateSearch} onChange={(event) => { setCandidateSearch(event.target.value); setCandidatePage(1); }} placeholder="Ketik nama…" className="w-56 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#1E3A2B]" /></label><label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={showDeletedCandidates} onChange={(event) => { setShowDeletedCandidates(event.target.checked); setCandidatePage(1); }} className="h-4 w-4 accent-[#1E3A2B]" />Terhapus <span className="rounded-full bg-white px-2 py-0.5 text-xs">{data.candidates.filter((candidate) => candidate.deleted_at).length}</span></label></div></header>
      {loading ? <p className="p-10 text-center text-sm text-slate-500">Memuat data kandidat…</p> : searchedCandidates.length ? <><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Nama kandidat</th><th className="px-4 py-3">Status CV</th><th className="px-4 py-3">Status wawancara</th><th className="px-4 py-3">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleCandidatesPage.map((candidate) => <tr key={candidate.id}><td className="px-4 py-3 font-semibold text-slate-800">{candidate.nama}</td><td className="px-4 py-3 text-slate-600">{candidate.status_cv || 'Belum dinilai'}</td><td className="px-4 py-3 text-slate-600">{candidate.status_interview || 'Belum dinilai'}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2">{showDeletedCandidates ? <button type="button" disabled={saving} onClick={() => changeCandidateState(candidate, 'RESTORE')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Pulihkan</button> : <><button type="button" onClick={() => setEditingCandidate({ ...candidate })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button><button type="button" disabled={saving} onClick={() => changeCandidateState(candidate, 'SOFT_DELETE')} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Hapus</button></>}</div></td></tr>)}</tbody></table></div><TablePagination page={currentCandidatePage} total={searchedCandidates.length} onPageChange={setCandidatePage} /></> : <p className="p-10 text-center text-sm text-slate-500">{candidateSearch ? 'Tidak ada kandidat yang cocok dengan pencarian.' : showDeletedCandidates ? 'Belum ada data kandidat terhapus.' : 'Belum ada data kandidat pada batch ini.'}</p>}
    </section>}

    {activeModule === 'personnel' && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><h3 className="text-lg font-bold text-slate-900">Akses Staff</h3><p className="mt-1 text-xs text-slate-500">Personel terverifikasi. PIN dibagikan berdasarkan peran (Staff/Admin), bukan PIN pribadi.</p></div><button type="button" onClick={() => { setEditingPersonnel({ personnelId: null, fullName: '', role: 'STAFF' }); setPersonnelModalTab('single'); setBulkWhitelistText(''); setBulkWhitelistPreview(null); setBulkDefaultRole('STAFF'); setError(''); }} className="rounded-lg bg-[#1E3A2B] px-3 py-2.5 text-xs font-bold text-white hover:bg-[#294d39]">+ Tambah Whitelist Staff</button></header>
      <div className="border-b border-slate-100 p-4"><label className="block max-w-sm"><span className="mb-1 block text-[11px] font-semibold text-slate-500">Cari nama atau departemen</span><input type="search" value={personnelSearch} onChange={(event) => { setPersonnelSearch(event.target.value); setPersonnelPage(1); }} placeholder="Nama / LSPD / LSSD…" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#1E3A2B]" /></label></div>
      {loading ? <p className="p-10 text-center text-sm text-slate-500">Memuat daftar personel…</p> : searchedPersonnel.length ? <><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Nama</th><th className="px-4 py-3">Pangkat / Posisi</th><th className="px-4 py-3">Departemen</th><th className="relative w-[120px] min-w-[120px] max-w-[120px] whitespace-nowrap px-4 py-3"><RoleFilterHeader value={personnelRoleFilter} onChange={(role) => { setPersonnelRoleFilter(role); setPersonnelPage(1); }} /></th><th className="px-4 py-3">Akses</th><th className="px-4 py-3">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{visiblePersonnelPage.map((person) => <tr key={person.id} className={!person.is_active ? 'bg-slate-50 text-slate-400' : ''}><td className="px-4 py-3 font-semibold">{person.full_name}</td><td className="px-4 py-3">{person.rank || '—'}{person.position ? ` · ${person.position}` : ''}</td><td className="px-4 py-3">{person.department || '—'}</td><td className="px-4 py-3">{person.role === 'ADMIN' ? 'Admin' : 'Staff'}</td><td className="px-4 py-3">{person.is_active ? 'Aktif' : 'Dinonaktifkan'}</td><td className="px-4 py-3"><div className="flex gap-2"><button type="button" onClick={() => setEditingPersonnel({ personnelId: person.id, fullName: person.full_name, role: person.role, rank: person.rank || '', position: person.position || '', department: person.department || 'LSPD' })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50">Edit</button>{person.is_active && <button type="button" disabled={saving} onClick={() => deletePersonnel(person)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Hapus akses</button>}</div></td></tr>)}</tbody></table></div><TablePagination page={currentPersonnelPage} total={searchedPersonnel.length} onPageChange={setPersonnelPage} /></> : <p className="p-10 text-center text-sm text-slate-500">{personnelSearch ? 'Tidak ada personel yang cocok dengan pencarian.' : 'Belum ada personel terdaftar.'}</p>}
      {pendingWhitelist.length > 0 && <div className="border-t border-slate-100 p-4"><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h4 className="text-sm font-bold text-slate-800">Whitelist menunggu login · {pendingWhitelist.length}</h4><p className="mt-1 text-xs text-slate-500">Profil pangkat, posisi, dan departemen diisi staff saat login pertama.</p></div><label className="block w-full max-w-sm"><span className="mb-1 block text-[11px] font-semibold text-slate-500">Cari nama whitelist</span><input type="search" value={whitelistSearch} onChange={(event) => { setWhitelistSearch(event.target.value); setWhitelistPage(1); }} placeholder="Ketik nama…" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#1E3A2B]" /></label></div>{searchedWhitelist.length ? <><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Nama lengkap</th><th className="relative w-[120px] min-w-[120px] max-w-[120px] whitespace-nowrap px-3 py-2"><RoleFilterHeader value={whitelistRoleFilter} onChange={(role) => { setWhitelistRoleFilter(role); setWhitelistPage(1); }} /></th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleWhitelistPage.map((item) => <tr key={item.id}><td className="px-3 py-2 font-medium text-slate-700">{item.full_name}</td><td className="px-3 py-2">{editingWhitelist?.id === item.id ? <select aria-label={`Peran untuk ${item.full_name}`} value={editingWhitelist.role} onChange={(event) => setEditingWhitelist({ ...editingWhitelist, role: event.target.value })} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"><option value="STAFF">Staff</option><option value="ADMIN">Admin</option></select> : item.role === 'ADMIN' ? 'Admin' : 'Staff'}</td><td className="px-3 py-2 text-amber-700">Menunggu login</td><td className="px-3 py-2"><div className="flex flex-wrap gap-2">{editingWhitelist?.id === item.id ? <><button type="button" disabled={saving} onClick={saveWhitelistRole} className="rounded-lg bg-[#1E3A2B] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Simpan</button><button type="button" disabled={saving} onClick={() => setEditingWhitelist(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50">Batal</button></> : <><button type="button" onClick={() => setEditingWhitelist({ id: item.id, role: item.role })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button><button type="button" disabled={saving} onClick={() => deleteWhitelist(item)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Hapus</button></>}</div></td></tr>)}</tbody></table></div><TablePagination page={currentWhitelistPage} total={searchedWhitelist.length} onPageChange={setWhitelistPage} /></> : <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Tidak ada nama whitelist yang cocok dengan pencarian.</p>}</div>}
    </section>}

    {selectedCandidateIds.length > 0 && <div className="fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur sm:inset-x-auto sm:bottom-6 sm:w-[min(90vw,760px)] sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3">
      <div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1E3A2B] text-sm font-bold text-white">{selectedCandidateIds.length}</span><span><strong className="block text-sm text-slate-900">Kandidat dipilih</strong><small className="text-xs text-slate-500">Tetapkan seluruh pilihan ke satu kelompok</small></span></div>
      <div className="flex gap-2"><select value={targetGroupId} onChange={(event) => setTargetGroupId(event.target.value)} aria-label="Kelompok tujuan" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#1E3A2B] sm:max-w-64">{data.groups.map((group) => <option key={group.id} value={group.id} disabled={!(membersByGroup.get(group.id) || []).length}>{group.name}{!(membersByGroup.get(group.id) || []).length ? ' · belum ada anggota' : ''}</option>)}</select><button type="button" disabled={bulkSaving || !targetGroup || !targetGroupMembers.length} onClick={assignSelectedCandidates} className="shrink-0 rounded-lg bg-[#1E3A2B] px-3 py-2 text-xs font-bold text-white hover:bg-[#294d39] disabled:cursor-not-allowed disabled:opacity-50">{bulkSaving ? 'Memindahkan…' : 'Tetapkan ke Kelompok PIC'}</button><button type="button" onClick={() => setSelectedCandidateIds([])} aria-label="Batalkan pilihan" className="rounded-lg px-2 py-2 text-slate-500 hover:bg-slate-100">×</button></div>
    </div>}

    {editingCandidate && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm"><form onSubmit={saveCandidate} className="my-auto w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"><div><p className="text-xs font-bold uppercase tracking-wider text-[#1E3A2B]">Data Kandidat</p><h3 className="mt-1 text-xl font-bold text-slate-900">Edit kandidat</h3></div><label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">Nama lengkap</span><input required minLength={2} maxLength={100} value={editingCandidate.nama || ''} onChange={(event) => setEditingCandidate({ ...editingCandidate, nama: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1E3A2B]" /></label><label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">Tautan Thread CV</span><input required type="url" maxLength={2048} inputMode="url" placeholder="https://forum.example/thread/..." value={editingCandidate.link_cv || ''} onChange={(event) => setEditingCandidate({ ...editingCandidate, link_cv: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1E3A2B]" /><small className="mt-1 block text-xs text-slate-500">Masukkan tautan thread forum yang dapat dibuka oleh tim rekrutmen.</small></label><div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">Status CV</span><select value={editingCandidate.status_cv || 'Pending'} onChange={(event) => setEditingCandidate({ ...editingCandidate, status_cv: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option>Pending</option><option>Interview</option><option>Accepted</option><option>Rejected</option></select></label><label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">Status wawancara</span><select value={editingCandidate.status_interview || 'Pending'} onChange={(event) => setEditingCandidate({ ...editingCandidate, status_interview: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option>Pending</option><option>Passed</option><option>Failed</option></select></label><label className="block sm:col-span-2"><span className="mb-1 block text-sm font-semibold text-slate-700">Pemeriksaan MDT</span><select value={editingCandidate.mdt_check || ''} onChange={(event) => setEditingCandidate({ ...editingCandidate, mdt_check: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">Belum diperiksa</option><option>Green</option><option>Yellow</option><option>Red</option></select></label></div><footer className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" disabled={saving} onClick={() => setEditingCandidate(null)} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600">Batal</button><button type="submit" disabled={saving} className="rounded-lg bg-[#1E3A2B] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Menyimpan…' : 'Simpan perubahan'}</button></footer></form></div>}

    {editingPersonnel && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm"><form onSubmit={editingPersonnel.personnelId || personnelModalTab === 'single' ? savePersonnel : saveBulkWhitelist} className={`my-auto w-full ${bulkWhitelistPreview && !editingPersonnel.personnelId && personnelModalTab === 'bulk' ? 'max-w-4xl' : 'max-w-lg'} space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl`}>
      <div><p className="text-xs font-bold uppercase tracking-wider text-[#1E3A2B]">Akses Staff</p><h3 className="mt-1 text-xl font-bold text-slate-900">{editingPersonnel.personnelId ? 'Edit identitas dan akses' : 'Tambah Whitelist Staff'}</h3></div>
      {!editingPersonnel.personnelId && <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => { setPersonnelModalTab('single'); setBulkWhitelistPreview(null); }} className={`rounded-lg px-3 py-2 text-sm font-semibold ${personnelModalTab === 'single' ? 'bg-white text-[#1E3A2B] shadow-sm' : 'text-slate-500'}`}>Input Satuan</button><button type="button" onClick={() => { setPersonnelModalTab('bulk'); setBulkWhitelistPreview(null); }} className={`rounded-lg px-3 py-2 text-sm font-semibold ${personnelModalTab === 'bulk' ? 'bg-white text-[#1E3A2B] shadow-sm' : 'text-slate-500'}`}>Input Massal (Bulk)</button></div>}
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>}
      {(!editingPersonnel.personnelId && personnelModalTab === 'bulk') ? <>
        {!bulkWhitelistPreview ? <>
          <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">Daftar nama</span><textarea required rows={10} maxLength={120000} value={bulkWhitelistText} onChange={(event) => setBulkWhitelistText(event.target.value)} placeholder={'#61102 - Nama Staff\n#61103 - Nama Staff Lain\nVACANT'} className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm outline-none focus:border-[#1E3A2B]" /></label>
        <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">Peran awal</span><select value={editingPersonnel.role} onChange={(event) => { setEditingPersonnel({ ...editingPersonnel, role: event.target.value }); setBulkDefaultRole(event.target.value); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="STAFF">Staff</option><option value="ADMIN">Admin</option></select></label>
          <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">Baris VACANT dan kosong diabaikan. Prefiks nomor seperti #61102 - dihapus; nama disimpan dalam bentuk asli dan normalized_name dibuat otomatis.</p>
        </> : <section aria-label="Pratinjau whitelist" className="space-y-3"><div className="flex flex-wrap items-end justify-between gap-3"><div><h4 className="text-sm font-bold text-slate-900">Pratinjau data whitelist</h4><p className="mt-1 text-xs text-slate-500">Nama dan peran dapat diperiksa sebelum disimpan.</p></div><div className="flex flex-wrap items-end gap-2"><label className="block"><span className="mb-1 block text-[11px] font-semibold text-slate-500">Terapkan Peran Ini untuk Semua</span><select value={bulkDefaultRole} onChange={(event) => setBulkDefaultRole(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="STAFF">Staff</option><option value="ADMIN">Admin</option></select></label><button type="button" onClick={() => setBulkWhitelistPreview((current) => ({ ...current, rows: current.rows.map((row) => ({ ...row, role: bulkDefaultRole })) }))} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100">Terapkan</button><span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{bulkWhitelistPreview.rows.length} nama valid</span></div></div>{bulkWhitelistPreview.vacantCount > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{bulkWhitelistPreview.vacantCount} baris VACANT diabaikan.</p>}<div className="max-h-72 w-full overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200"><table className="w-full table-fixed text-left text-xs"><colgroup><col className="w-[35%]" /><col className="w-[45%]" /><col className="w-[20%]" /></colgroup><thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Teks Sumber</th><th className="px-3 py-2">Nama Bersih (Full Name)</th><th className="px-3 py-2">Peran</th></tr></thead><tbody className="divide-y divide-slate-100">{bulkWhitelistPreview.rows.map((row) => <tr key={`${row.line}-${row.normalizedName}`}><td className="break-words px-3 py-2 text-slate-500" title={row.source}>{row.source}</td><td className="break-words px-3 py-2 font-semibold text-slate-800">{row.fullName}</td><td className="px-3 py-2"><select aria-label={`Peran untuk ${row.fullName}`} value={row.role} onChange={(event) => setBulkWhitelistPreview((current) => ({ ...current, rows: current.rows.map((item) => item.normalizedName === row.normalizedName ? { ...item, role: event.target.value } : item) }))} className="max-w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"><option value="STAFF">Staff</option><option value="ADMIN">Admin</option></select></td></tr>)}</tbody></table></div><p className="text-xs text-slate-500">{bulkWhitelistPreview.skippedCount} baris kosong, VACANT, atau duplikat tidak disertakan.</p></section>}
      </> : <>
        <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">Nama Lengkap</span><input required minLength={2} maxLength={80} value={editingPersonnel.fullName} onChange={(event) => setEditingPersonnel({ ...editingPersonnel, fullName: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#1E3A2B]" /></label>
        {editingPersonnel.personnelId && <div className="grid gap-3 sm:grid-cols-3"><label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">Pangkat</span><input required minLength={2} maxLength={60} value={editingPersonnel.rank} onChange={(event) => setEditingPersonnel({ ...editingPersonnel, rank: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">Posisi</span><input maxLength={100} value={editingPersonnel.position} onChange={(event) => setEditingPersonnel({ ...editingPersonnel, position: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">Departemen</span><select value={editingPersonnel.department} onChange={(event) => setEditingPersonnel({ ...editingPersonnel, department: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="LSPD">LSPD</option><option value="LSSD">LSSD</option></select></label></div>}
        <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">Peran</span><select value={editingPersonnel.role} onChange={(event) => setEditingPersonnel({ ...editingPersonnel, role: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="STAFF">Staff</option><option value="ADMIN">Admin</option></select></label>
        {editingPersonnel.personnelId && <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">PIN tidak disimpan per orang. Login menggunakan PIN bersama sesuai peran yang diatur lewat generator PIN.</p>}
      </>}
      <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">{bulkWhitelistPreview && !editingPersonnel.personnelId && personnelModalTab === 'bulk' && <button type="button" disabled={saving} onClick={() => { setBulkWhitelistPreview(null); setError(''); }} className="mr-auto rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600">Kembali Edit</button>}<button type="button" disabled={saving} onClick={() => { setEditingPersonnel(null); setBulkWhitelistPreview(null); }} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600">Batal</button><button type="button" disabled={saving} onClick={bulkWhitelistPreview && !editingPersonnel.personnelId && personnelModalTab === 'bulk' ? saveBulkWhitelist : personnelModalTab === 'bulk' && !editingPersonnel.personnelId ? previewBulkWhitelist : savePersonnel} className="rounded-lg bg-[#1E3A2B] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Menyimpan…' : personnelModalTab === 'bulk' && !editingPersonnel.personnelId ? bulkWhitelistPreview ? `Simpan ${bulkWhitelistPreview.rows.length} Data Whitelist` : 'Lihat Pratinjau' : editingPersonnel.personnelId ? 'Simpan profil' : 'Tambah ke whitelist'}</button></footer>
    </form></div>}

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
