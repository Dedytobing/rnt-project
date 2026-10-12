'use client';
import { useState, useEffect, useCallback } from 'react';
import Pagination, { PAGE_SIZE } from '../components/Pagination';

const ACTION_LABELS = {
  REVIEW_CV: 'Review CV',
  INTERVIEW: 'Interview',
  ADMIN_OVERRIDE: 'Perubahan admin',
  REGISTER: 'Pendaftaran kandidat',
  SOFT_DELETE: 'Hapus kandidat',
  RESTORE: 'Pemulihan kandidat',
  LOGIN_SUCCESS: 'Login berhasil',
  LOGIN_FAILURE: 'Login gagal',
  LOGOUT: 'Logout',
  SESSION_RESTORED: 'Sesi dipulihkan',
  SESSION_RESUMED: 'Sesi dilanjutkan',
  ACCESS_ADDED: 'Akses ditambahkan',
  ACCESS_UPDATED: 'Akses diperbarui',
  ACCESS_ROLE_CHANGED: 'Perubahan peran akses',
  ACCESS_REMOVED: 'Akses dicabut',
  BULK_ACCESS_UPDATED: 'Akses massal diperbarui',
  PERSONNEL_ADDED: 'Personel ditambahkan',
  PERSONNEL_UPDATED: 'Personel diperbarui',
  PERSONNEL_DEACTIVATED: 'Personel dinonaktifkan',
  ACADEMY_ATTENDANCE: 'Absensi Academy',
  EQUIPMENT_UPDATE: 'Pembagian perlengkapan',
  BATCH_CREATED: 'Batch dibuat',
  BATCH_UPDATED: 'Jadwal batch diubah',
  BATCH_DELETED: 'Batch dihapus',
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/audit-logs');
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Audit log gagal dimuat.');
      setLogs(data.logs || []);
    } catch (error) {
      setLoadError(error.message || 'Audit log gagal dimuat.');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // This effect starts an external request; state changes happen in its async lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = logs.filter(log => {
    const matchSearch = 
      (log.officer_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.candidates?.nama || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.action_details || '').toLowerCase().includes(search.toLowerCase());

    const matchAction = filterAction === 'ALL' || log.role_action === filterAction;

    return matchSearch && matchAction;
  });
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800">Audit Log Global</h1>
            <span className="bg-rose-100 text-rose-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-rose-300">
              Khusus Team RED
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Riwayat perubahan kandidat, akses personel, login, dan aktivitas Academy.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg transition border border-slate-300">
          {loading ? 'Memuat…' : 'Refresh log'}
        </button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Informasi kolom audit log">
        {[
          ['Waktu', 'Tanggal dan jam tindakan dicatat.'],
          ['Staff / Executor', 'Nama personel yang menjalankan tindakan.'],
            ['Kandidat / Target', 'Kandidat, personel, atau batch yang terkait.'],
          ['Jenis dan detail', 'Pendaftaran, review CV, interview, atau keputusan Team RED beserta catatannya.'],
        ].map(([title, description]) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{title}</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{description}</p>
          </div>
        ))}
      </section>

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        {/* BAR FILTER */}
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <input 
            type="text" 
            placeholder="Cari nama staff, kandidat, atau detail..." 
            className="border border-slate-300 p-2.5 rounded-lg text-xs text-slate-900 bg-white w-72 focus:outline-none focus:border-blue-500" 
            value={search} 
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
          />

          <select 
            className="border border-slate-300 p-2 rounded-lg text-xs text-slate-900 bg-white font-bold focus:outline-none focus:border-blue-500" 
            value={filterAction} 
            onChange={e => { setFilterAction(e.target.value); setCurrentPage(1); }}>
            <option value="ALL">Semua Jenis Action</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        {/* TABEL LOG AUDIT GLOBAL */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                <th className="p-3">Waktu</th>
                <th className="p-3">Staff / Executor</th>
                <th className="p-3">Kandidat / Target</th>
                <th className="p-3">Jenis Action</th>
                <th className="p-3">Detail Perubahan / Catatan</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="text-center p-8 text-slate-400">Memuat data histori audit...</td></tr>
              ) : loadError ? (
                <tr><td colSpan="5" className="text-center p-8 text-rose-700" role="alert">Gagal memuat audit log: {loadError}</td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan="5" className="text-center p-8 text-slate-500">Belum ada catatan yang cocok. Tindakan baru akan tercatat setelah pendaftaran, review CV, interview, atau penetapan Team RED disimpan.</td></tr>
              ) : (
                paginatedLogs.map(log => {
                  const formattedDate = new Date(log.created_at).toLocaleString('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  });

                  return (
                    <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td className="p-3 text-slate-500 font-mono whitespace-nowrap">{formattedDate}</td>
                      <td className="p-3 font-bold text-slate-800 whitespace-nowrap">
                        👤 {log.officer_name}
                      </td>
                      <td className="p-3 font-bold text-slate-700 whitespace-nowrap">
                        {log.candidates?.nama || log.target_name || '—'}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                          log.role_action === 'ADMIN_OVERRIDE' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                          log.role_action === 'INTERVIEW' ? 'bg-indigo-100 text-indigo-800 border border-indigo-300' :
                          ['REVIEW_CV', 'ACCESS_ADDED', 'ACCESS_UPDATED', 'ACCESS_ROLE_CHANGED', 'PERSONNEL_ADDED', 'PERSONNEL_UPDATED'].includes(log.role_action) ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                          'bg-slate-100 text-slate-700 border border-slate-300'
                        }`}>
                          {ACTION_LABELS[log.role_action] || 'Aktivitas sistem'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 max-w-md leading-relaxed">
                        {log.action_details}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={currentPage} totalItems={filteredLogs.length} onPageChange={setCurrentPage} />
      </div>
    </div>
  );
}
