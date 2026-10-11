'use client';

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Pagination, { PAGE_SIZE } from '../components/Pagination';
import { BatchContext, candidatesUrl } from '../BatchContext';

const departments = [
  { id: 'LSSD', label: "Los Santos Sheriff's Department", logo: '/logos/lssd.png' },
  { id: 'LSPD', label: 'Los Santos Police Department', logo: '/logos/lspd.png' },
];

const DEFAULT_ACADEMY_DETAILS = {
  date: '24/10/2026',
  time: '20:00 GMT+7 (WIB)',
  location: 'Alta HQ',
};

function createAcademyBbcode(candidate, staffProfile, academyDetails) {
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

We are pleased to inform you that you have successfully [b][color=#408000]PASSED[/color][/b] the interview stage of the Law Enforcement Officer recruitment process. Your performance and responses during the interview demonstrated the qualities we seek in a future officer.

You are now one step away from officially joining the [b]LEO Academy[/b]. The final requirement is your attendance at the upcoming academy session, where you will receive foundational training before entering active duty as a Probationary Officer.

Please take note of the following details regarding the Academy:

📅 Date: ${academyDetails.date}
⏰ Time: ${academyDetails.time}
📍 Location: ${academyDetails.location}

Your attendance is mandatory, and punctuality is expected. Please arrive in appropriate attire (business casual or department-approved clothing) and be prepared for your initial orientation and training.

⚠️ Important Notice:
If you fail to attend the academy session or fail to communicate with the Recruitment Division prior to the scheduled time, your application will be considered withdrawn and will be terminated from the current batch. You will need to reapply during the next recruitment cycle if you still wish to pursue a position within the department.

If you have any questions or require further assistance, please contact a Recruitment Officer or visit us directly at [b]Alta Station HQ[/b].

We look forward to welcoming you to the Academy.

[right]Sincerely,  
${signature || 'Recruitment Staff'}[/right]
[/divbox]`;
}

export default function PlacementPage() {
  const { selectedBatch } = useContext(BatchContext);
  const [role, setRole] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');
  const [placementFilter, setPlacementFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [staffProfile, setStaffProfile] = useState({ name: '', rank: '', position: '', department: '' });
  const [academyDetailsByCandidate, setAcademyDetailsByCandidate] = useState({});
  const [academyMessage, setAcademyMessage] = useState('');

  const loadCandidates = useCallback(async () => {
    const response = await fetch(candidatesUrl(selectedBatch?.id));
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Gagal memuat kandidat.');
    setCandidates(data.data || []);
  }, [selectedBatch?.id]);

  useEffect(() => {
    let active = true;
    fetch('/api/internal/session')
      .then((response) => response.json())
      .then(async (session) => {
        if (!active) return;
        setRole(session.authenticated ? session.userRole : '');
        if (session.authenticated) {
          setStaffProfile({
            name: session.officerName || '',
            rank: session.officerRank || '',
            position: session.officerPosition || '',
            department: session.officerDepartment || '',
          });
        }
        if (session.userRole === 'ADMIN') await loadCandidates();
      })
      .catch((error) => {
        if (active) setMessage({ type: 'error', text: error.message || 'Gagal memuat sesi.' });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [loadCandidates]);

  const acceptedCandidates = useMemo(() => candidates
    .filter((candidate) => candidate.status_interview === 'Passed'), [candidates]);
  const filteredCandidates = useMemo(() => acceptedCandidates
    .filter((candidate) => {
      const hasPlacement = Boolean(candidate.mapping_dept);
      const matchesPlacement = placementFilter === 'ALL' ||
        (placementFilter === 'PLACED' && hasPlacement) ||
        (placementFilter === 'UNPLACED' && !hasPlacement);
      return matchesPlacement && candidate.nama.toLowerCase().includes(search.toLowerCase());
    }), [acceptedCandidates, placementFilter, search]);
  const paginatedCandidates = filteredCandidates.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedCandidate = acceptedCandidates.find((candidate) => candidate.id === selectedId);
  const selectedAcademyDetails = selectedCandidate
    ? { ...DEFAULT_ACADEMY_DETAILS, ...academyDetailsByCandidate[selectedCandidate.id] }
    : DEFAULT_ACADEMY_DETAILS;
  const academyBbcode = selectedCandidate?.status_interview === 'Passed'
    ? createAcademyBbcode(selectedCandidate, staffProfile, selectedAcademyDetails)
    : '';
  const unplacedCount = acceptedCandidates.filter((candidate) => !candidate.mapping_dept).length;
  const placedCount = acceptedCandidates.length - unplacedCount;

  useEffect(() => {
    setCurrentPage(1);
  }, [search, placementFilter]);

  const selectCandidate = (candidate) => {
    setSelectedId(candidate.id);
    setDepartment(candidate.mapping_dept || '');
    setMessage(null);
    setAcademyMessage('');
  };

  const savePlacement = async (event) => {
    event.preventDefault();
    if (!selectedCandidate || !department) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ADMIN_OVERRIDE_CANDIDATE', id: selectedCandidate.id, mappingDept: department, departmentOnly: true }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Penempatan belum dapat disimpan.');
      setMessage({ type: 'success', text: data.message });
      await loadCandidates();
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const copyAcademyBbcode = async () => {
    if (!selectedAcademyDetails.date.trim() || !selectedAcademyDetails.time.trim() || !selectedAcademyDetails.location.trim()) {
      setAcademyMessage('Lengkapi tanggal, waktu, dan lokasi Academy sebelum menyalin.');
      return;
    }

    try {
      await navigator.clipboard.writeText(academyBbcode);
      setAcademyMessage('Template Academy berhasil disalin.');
    } catch {
      setAcademyMessage('Clipboard tidak tersedia. Salin BBCode dari pratinjau.');
    }
  };

  if (loading) return <div className="staff-panel p-6 text-sm text-slate-500">Memuat data penempatan…</div>;
  if (role !== 'ADMIN') return <div className="staff-panel p-6"><h2>Akses khusus Team RED</h2><p className="text-sm text-slate-500">Hanya Team RED yang dapat menentukan departemen final kandidat.</p></div>;

  return (
    <div className="placement-page space-y-4">
      <div className="staff-panel-heading placement-header">
        <div><span className="staff-section-label">TEAM RED / KEPUTUSAN FINAL</span><h2>Penempatan departemen</h2><p>Tinjau status keputusan dan tetapkan departemen final kandidat yang diterima.</p></div>
        <span className="staff-admin-pill">TEAM RED</span>
      </div>

      {message && <div role="status" className={`staff-notice ${message.type}`}>{message.text}</div>}

      <div className="placement-layout">
        <section className="staff-panel placement-candidates">
          <div className="staff-panel-title placement-list-heading"><div><h3>Lulus interview</h3><p>{filteredCandidates.length} dari {acceptedCandidates.length} kandidat</p></div></div>
          <div className="placement-filters" role="group" aria-label="Filter status penempatan">
            {[
              { id: 'ALL', label: 'Semua', count: acceptedCandidates.length },
              { id: 'UNPLACED', label: 'Belum diputuskan', count: unplacedCount },
              { id: 'PLACED', label: 'Sudah diputuskan', count: placedCount },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={placementFilter === item.id}
                onClick={() => setPlacementFilter(item.id)}
                className={`placement-filter ${placementFilter === item.id ? 'active' : ''}`}
              >
                {item.label} <span className="ml-0.5 opacity-70">{item.count}</span>
              </button>
            ))}
          </div>
          <label className="placement-search-wrap"><span aria-hidden="true">⌕</span><input className="placement-search" type="search" aria-label="Cari nama kandidat" placeholder="Cari nama kandidat…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <div className="placement-list">
            {filteredCandidates.length === 0 ? <div className="placement-empty">{acceptedCandidates.length === 0 ? 'Belum ada kandidat yang lulus interview.' : 'Tidak ada kandidat yang cocok dengan filter ini.'}</div> : paginatedCandidates.map((candidate) => (
              <button type="button" key={candidate.id} className={`placement-candidate ${selectedId === candidate.id ? 'selected' : ''}`} onClick={() => selectCandidate(candidate)}>
                <span className="placement-candidate-copy"><strong>{candidate.nama}</strong><small>Minat: {candidate.dept_preference || 'Belum diisi'}</small></span>
                <em className={candidate.mapping_dept ? 'placed' : 'unplaced'}>{candidate.mapping_dept || 'Belum ditetapkan'}</em>
              </button>
            ))}
          </div>
          <Pagination page={currentPage} totalItems={filteredCandidates.length} onPageChange={setCurrentPage} />
        </section>

        <section className="staff-panel placement-editor">
          {!selectedCandidate ? <div className="placement-placeholder"><span>⌖</span><h3>Pilih kandidat</h3><p>Pilih kandidat yang lulus interview untuk menentukan penempatan akhir.</p></div> : (
            <form onSubmit={savePlacement}>
              <span className="staff-section-label">KEPUTUSAN TEAM RED</span>
              <h2>{selectedCandidate.nama}</h2>
              <div className="placement-reference"><span>Minat kandidat</span><strong>{selectedCandidate.dept_preference || 'Belum menyampaikan preferensi'}</strong></div>
              <fieldset className="placement-options">
                <legend>Departemen final</legend>
                {departments.map((item) => <button key={item.id} type="button" aria-pressed={department === item.id} className={`placement-option ${department === item.id ? 'selected' : ''}`} onClick={() => setDepartment(item.id)}>
                  <Image src={item.logo} alt="" width={35} height={35} /><span><strong>{item.id}</strong><small>{item.label}</small></span>{department === item.id && <b>✓</b>}
                </button>)}
              </fieldset>
              <button className="placement-save" type="submit" disabled={!department || saving}>{saving ? 'Menyimpan…' : 'Tetapkan penempatan final'}</button>
              <p className="placement-note">Perubahan ini dicatat di Audit Log Team RED.</p>

              {selectedCandidate.status_interview === 'Passed' ? (
                <section className="academy-template-card" aria-labelledby="academy-template-title">
                  <div className="academy-template-heading">
                    <div>
                      <span className="academy-template-kicker">RECRUITMENT &amp; TRAINING</span>
                      <h3 id="academy-template-title">Template balasan Academy</h3>
                      <p>Konfirmasi kandidat lulus interview dan undangan ke sesi Academy.</p>
                    </div>
                    <span className="academy-passed-badge">PASSED</span>
                  </div>

                  <div className="academy-details-grid">
                    <label>
                      <span>Tanggal Academy *</span>
                      <input
                        type="text"
                        value={selectedAcademyDetails.date}
                        onChange={(event) => {
                          setAcademyDetailsByCandidate((current) => ({
                            ...current,
                            [selectedCandidate.id]: { ...selectedAcademyDetails, date: event.target.value },
                          }));
                          setAcademyMessage('');
                        }}
                        placeholder="Masukkan tanggal terbaru"
                      />
                    </label>
                    <label>
                      <span>Waktu *</span>
                      <input
                        type="text"
                        value={selectedAcademyDetails.time}
                        onChange={(event) => {
                          setAcademyDetailsByCandidate((current) => ({
                            ...current,
                            [selectedCandidate.id]: { ...selectedAcademyDetails, time: event.target.value },
                          }));
                          setAcademyMessage('');
                        }}
                        placeholder="Contoh: 20:00 GMT+7 (WIB)"
                      />
                    </label>
                    <label className="academy-details-location">
                      <span>Lokasi *</span>
                      <input
                        type="text"
                        value={selectedAcademyDetails.location}
                        onChange={(event) => {
                          setAcademyDetailsByCandidate((current) => ({
                            ...current,
                            [selectedCandidate.id]: { ...selectedAcademyDetails, location: event.target.value },
                          }));
                          setAcademyMessage('');
                        }}
                        placeholder="Contoh: Alta HQ"
                      />
                    </label>
                  </div>

                  <label className="academy-preview-label" htmlFor="academy-bbcode-preview">Pratinjau BBCode</label>
                  <textarea id="academy-bbcode-preview" className="academy-bbcode-preview" rows="12" readOnly value={academyBbcode} />
                  <div className="academy-template-actions">
                    <span role="status" aria-live="polite">{academyMessage || 'Tanggal pada contoh awal sudah lewat. Masukkan jadwal Academy yang berlaku.'}</span>
                    <button type="button" onClick={copyAcademyBbcode} disabled={!selectedAcademyDetails.date.trim() || !selectedAcademyDetails.time.trim() || !selectedAcademyDetails.location.trim()}>
                      {academyMessage === 'Template Academy berhasil disalin.' ? 'Tersalin ✓' : 'Salin BBCode'}
                    </button>
                  </div>
                </section>
              ) : (
                <div className="academy-template-unavailable">Template Academy tersedia setelah hasil interview kandidat berstatus Passed.</div>
              )}
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
