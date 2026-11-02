'use client';

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BatchContext } from '../BatchContext';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function BonusTable({ title, description, rows, columns, onPaymentChange, pendingPayments }) {
  const total = rows.reduce((sum, row) => sum + row.bonus, 0);
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </header>
      {rows.length ? <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <tr><th className="w-14 px-4 py-3">No</th>{columns.map((column) => <th key={column.key} className="px-4 py-3">{column.label}</th>)}<th className="w-32 px-4 py-3 text-center">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => {
              const rowIdentity = row.personnelId ? `personnel:${row.personnelId}` : `whitelist:${row.canonicalName || row.name}`;
              const key = `${rowIdentity}:${row.bonusType}`;
              return <tr key={key} className="hover:bg-slate-50/70">
                <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                <td className="px-4 py-3 font-semibold text-slate-800">{row.name}</td>
                {columns.slice(1).map((column) => <td key={column.key} className="px-4 py-3 text-slate-700">{column.render(row)}</td>)}
                <td className="px-4 py-3 text-center">{row.needsMapping || (!row.personnelId && !row.canonicalName) ? <span className="text-[11px] font-semibold text-amber-700" title="Nama belum cocok dengan master personel maupun whitelist">Perlu cocok nama</span> : <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                  <input type="checkbox" checked={row.isPaid} disabled={pendingPayments.has(key) || row.bonus === 0} onChange={(event) => onPaymentChange(row, event.target.checked)} className="h-4 w-4 accent-emerald-700" aria-label={`${row.isPaid ? 'Tandai belum dibayar' : 'Tandai sudah dibayar'}: ${row.name}`} />
                  {row.isPaid ? 'Dibayar' : 'Belum'}
                </label>}</td>
              </tr>;
            })}
          </tbody>
          <tfoot className="border-t-2 border-emerald-100 bg-emerald-50/70 font-bold text-slate-900">
            <tr><td colSpan={columns.length} className="px-4 py-3 text-right">Total bonus {title.toLowerCase()}</td><td className="px-4 py-3 text-right">{currency.format(total)}</td><td /></tr>
          </tfoot>
        </table>
      </div> : <div className="px-5 py-8 text-center text-sm text-slate-500"><p>Belum ada data penugasan untuk batch ini.</p><p className="mt-4 border-t border-emerald-100 pt-3 text-right font-bold text-slate-900">Total bonus {title.toLowerCase()} <span className="ml-3">{currency.format(total)}</span></p></div>}
    </section>
  );
}

function summarizeBonusRows(rows) {
  const total = rows.reduce((sum, row) => sum + row.bonus, 0);
  const paidRows = rows.filter((row) => row.isPaid);
  const paid = paidRows.reduce((sum, row) => sum + row.bonus, 0);
  return {
    total,
    paid,
    unpaid: total - paid,
    paidCount: paidRows.length,
    unpaidCount: rows.length - paidRows.length,
  };
}

function BonusSummaryCard({ title, summary, rate, rateUnit }) {
  const metrics = [
    { label: 'Total bonus', amount: summary.total, count: null },
    { label: 'Sudah dibayar', amount: summary.paid, count: summary.paidCount },
    { label: 'Belum dibayar', amount: summary.unpaid, count: summary.unpaidCount },
  ];
  return <section className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40">
    <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Ringkasan {title}</h2>
      <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-slate-600 dark:bg-[#10291f] dark:text-emerald-200">Rate {currency.format(rate)} / {rateUnit}</span>
    </header>
    <div className="grid gap-2 sm:grid-cols-3">
      {metrics.map((metric) => <div key={metric.label} className="rounded-lg border border-white/80 bg-white/80 px-2.5 py-2 dark:border-emerald-800 dark:bg-[#10291f]">
        <span className="text-[10px] font-semibold text-slate-500 dark:text-emerald-200">{metric.label}</span>
        <strong className="mt-0.5 block text-sm text-slate-900 dark:text-emerald-50">{currency.format(metric.amount)}</strong>
        {metric.count !== null && <span className="block text-[9px] text-slate-500 dark:text-emerald-300">{metric.count} personel</span>}
      </div>)}
    </div>
  </section>;
}

export default function BonusPage() {
  const { selectedBatch } = useContext(BatchContext);
  const batchId = selectedBatch?.id;
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [pendingPayments, setPendingPayments] = useState(new Set());

  const loadReport = useCallback(async () => {
    if (!batchId) { setReport(null); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/internal/bonus?batch_id=${encodeURIComponent(batchId)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Rekap bonus gagal dimuat.');
      setReport(result);
    } catch (issue) {
      setError(issue.message || 'Rekap bonus gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => { queueMicrotask(() => { void loadReport(); }); }, [loadReport]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const updatePayment = useCallback(async (row, isPaid) => {
    const identityKey = row.personnelId ? `personnel:${row.personnelId}` : `whitelist:${row.canonicalName}`;
    const key = `${identityKey}:${row.bonusType}`;
    const matchesRow = (item) => row.personnelId
      ? item.personnelId === row.personnelId
      : !item.personnelId && item.canonicalName === row.canonicalName;
    setPendingPayments((current) => new Set(current).add(key));
    setReport((current) => current && ({ ...current, [row.bonusType === 'TRAINER' ? 'trainers' : 'interviewers']: current[row.bonusType === 'TRAINER' ? 'trainers' : 'interviewers'].map((item) => matchesRow(item) ? { ...item, isPaid } : item) }));
    try {
      const response = await fetch('/api/internal/bonus', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, ...(row.personnelId ? { personnelId: row.personnelId } : { canonicalName: row.canonicalName }), bonusType: row.bonusType, isPaid }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Status pembayaran gagal disimpan.');
    } catch (issue) {
      setReport((current) => current && ({ ...current, [row.bonusType === 'TRAINER' ? 'trainers' : 'interviewers']: current[row.bonusType === 'TRAINER' ? 'trainers' : 'interviewers'].map((item) => matchesRow(item) ? { ...item, isPaid: row.isPaid } : item) }));
      setToast(issue.message || 'Status pembayaran gagal disimpan.');
    } finally {
      setPendingPayments((current) => { const next = new Set(current); next.delete(key); return next; });
    }
  }, [batchId]);

  const trainerRows = useMemo(() => (report?.trainers || []).map((row) => ({ ...row, bonusType: 'TRAINER' })), [report]);
  const interviewerRows = useMemo(() => (report?.interviewers || []).map((row) => ({ ...row, bonusType: 'INTERVIEWER' })), [report]);
  const trainerSummary = useMemo(() => summarizeBonusRows(trainerRows), [trainerRows]);
  const interviewerSummary = useMemo(() => summarizeBonusRows(interviewerRows), [interviewerRows]);

  return <main className="bonus-page mx-auto max-w-7xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800 dark:text-emerald-300">Internal RNT</p><h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">Kalkulator Bonus</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-300">Rekap otomatis berdasarkan penugasan Trainer dan interview pada batch terpilih.</p></div>
      <div className="rounded-xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Batch: {report?.batch?.name || selectedBatch?.name || 'Belum dipilih'}</div>
    </header>

    {error && <div role="alert" className={`rounded-xl border p-4 text-sm ${error.includes('khusus Admin') ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{error}{error.includes('Pastikan migrasi') && <p className="mt-1 text-xs">Pastikan migrasi personnel_bonus_payments dan bonus_whitelist_identity sudah diterapkan sebelum menggunakan halaman ini.</p>}</div>}
    {loading && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Memuat rekap bonus…</div>}
    {!loading && !selectedBatch?.id && <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">Pilih batch terlebih dahulu untuk menghitung bonus.</div>}
    {!loading && report && <div className="grid items-start gap-5 xl:grid-cols-2">
      <BonusSummaryCard title="Trainer" summary={trainerSummary} rate={report.rates.trainer} rateUnit="Trainer terpilih" />
      <BonusSummaryCard title="Interviewer" summary={interviewerSummary} rate={report.rates.interviewer} rateUnit="interview" />
      {report.unmappedInterviewerNames?.length > 0 && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 xl:col-span-2">Sebagian nama Interviewer belum cocok dengan master personel. Nama tetap masuk hitungan bonus, tetapi status pembayaran dinonaktifkan sampai nama personel dapat dicocokkan: {report.unmappedInterviewerNames.join(', ')}.</p>}
      <BonusTable title="Trainer" description={`Bonus tetap ${currency.format(report.rates.trainer)} untuk setiap Trainer yang dipilih pada batch ini.`} rows={trainerRows} columns={[{ key: 'name', label: 'List Trainer' }, { key: 'assignment', label: 'Status tugas', render: () => 'Bertugas' }, { key: 'bonus', label: 'Bonus', render: (row) => currency.format(row.bonus) }]} onPaymentChange={updatePayment} pendingPayments={pendingPayments} />
      <BonusTable title="Interviewer" description={`Bonus dihitung ${currency.format(report.rates.interviewer)} × interview yang tercatat sebagai Officer/Deputy.`} rows={interviewerRows} columns={[{ key: 'name', label: 'List Interviewer' }, { key: 'totalInterviews', label: 'Total Inter', render: (row) => row.totalInterviews }, { key: 'bonus', label: 'Bonus', render: (row) => currency.format(row.bonus) }]} onPaymentChange={updatePayment} pendingPayments={pendingPayments} />
    </div>}
    {toast && <div role="status" className="fixed bottom-5 right-5 z-50 rounded-xl bg-rose-700 px-4 py-3 text-sm font-semibold text-white shadow-lg">{toast}</div>}
  </main>;
}
