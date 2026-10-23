'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

function publicBatchName(name) {
  return String(name || 'Batch rekrutmen')
    .replace(/\btest\b/gi, '')
    .replace(/\s*[-–—:]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Batch rekrutmen';
}

function formatRegistrationDeadline(value) {
  if (!value) return '';
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric',
  }).format(date);
  const time = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
  return `${parts}, pukul ${time} WIB`;
}

export default function CandidatePage() {
  const [candForm, setCandForm] = useState({ cid: '', nama: '', gender: '', linkCv: '' });
  const [loading, setLoading] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [alert, setAlert] = useState({ show: false, msg: '', type: '' });
  const [activeBatch, setActiveBatch] = useState(null);
  const [staffGraceActive, setStaffGraceActive] = useState(false);
  const [showPortalBack, setShowPortalBack] = useState(false);
  const [portalReturnTo, setPortalReturnTo] = useState('/internal/dashboard');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const hasUnsavedChanges = Boolean(candForm.cid || candForm.nama || candForm.gender || candForm.linkCv);

  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldownSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  const cooldownMessage = cooldownSeconds >= 60
    ? `${Math.floor(cooldownSeconds / 60)} menit ${cooldownSeconds % 60} detik`
    : `${cooldownSeconds} detik`;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedReturnTo = params.get('returnTo') || '';
    const isInternalRoute = (path) => path.startsWith('/internal/') && !path.startsWith('//');
    let internalReturnTo = isInternalRoute(requestedReturnTo) ? requestedReturnTo : '';
    if (!internalReturnTo && document.referrer) {
      try {
        const referrer = new URL(document.referrer);
        if (referrer.origin === window.location.origin && isInternalRoute(referrer.pathname)) internalReturnTo = `${referrer.pathname}${referrer.search}`;
      } catch { /* Ignore invalid referrer values. */ }
    }
    const cameFromInternalPortal = params.get('source') === 'internal' && Boolean(internalReturnTo);
    if (internalReturnTo) {
      window.sessionStorage.setItem('candidate-input-origin', internalReturnTo);
    }

    fetch('/api/internal/session', { cache: 'no-store' })
      .then((response) => response.json())
      .then((session) => {
        setShowPortalBack(cameFromInternalPortal || Boolean(session.authenticated));
        if (session.authenticated && !internalReturnTo) setPortalReturnTo('/internal/dashboard');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const warnBeforeUnload = (event) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const navigateBack = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowCancelModal(true);
      return;
    }
    const origin = window.sessionStorage.getItem('candidate-input-origin');
    if (origin && window.history.length > 1) window.history.back();
    else window.location.assign(portalReturnTo);
  }, [hasUnsavedChanges, portalReturnTo]);

  const confirmCancelForm = () => {
    setShowCancelModal(false);
    const origin = window.sessionStorage.getItem('candidate-input-origin');
    if (origin && window.history.length > 1) window.history.back();
    else window.location.assign(portalReturnTo);
  };

  const navigateTo = useCallback((destination) => {
    if (hasUnsavedChanges && !window.confirm('Data formulir belum dikirim. Tinggalkan halaman dan buang perubahan?')) return;
    window.location.assign(destination);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    let mounted = true;
    const refreshRegistrationWindow = () => {
      fetch('/api/batches', { cache: 'no-store' }).then((response) => response.json())
        .then((data) => { if (mounted && data.success) { setActiveBatch(data.batch); setStaffGraceActive(Boolean(data.staffGraceActive)); } })
        .catch(() => { if (mounted) { setActiveBatch(null); setStaffGraceActive(false); } });
    };
    refreshRegistrationWindow();
    const timer = window.setInterval(refreshRegistrationWindow, 30_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  const handleCandSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setAlert({ show: false, msg: '', type: '' });

    try {
      const response = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ADD_CANDIDATE', ...candForm, batchId: activeBatch?.id }),
      });
      const data = await response.json();

      if (data.success) {
        setCooldownSeconds(0);
        setAlert({ show: true, msg: data.message || 'Pendaftaran berhasil dikirim.', type: 'success' });
        setCandForm({ cid: '', nama: '', gender: '', linkCv: '' });
      } else {
        console.error('Registration Error:', { status: response.status, error: data.error });
        if (response.status === 429) setCooldownSeconds(Math.max(1, Number(data.retryAfter) || Number(response.headers.get('Retry-After')) || 1));
        const isServerError = response.status >= 500;
        setAlert({
          show: true,
          msg: isServerError
            ? 'Pendaftaran gagal dikirim. Silakan coba beberapa saat lagi.'
            : data.error || 'Pendaftaran belum dapat dikirim.',
          type: 'error',
        });
      }
    } catch (error) {
      console.error('Registration Error:', error);
      setAlert({ show: true, msg: 'Tidak dapat terhubung ke server. Coba lagi sebentar.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="candidate-page">
      <header className="candidate-header">
        <Link href="/" onClick={(event) => { event.preventDefault(); navigateBack(); }} className="candidate-brand"><span>Recruitment and Training<small>Personnel Portal</small></span></Link>
        <button type="button" onClick={() => navigateTo('/internal/select-batch')} className="candidate-staff-link">Portal staff <span>↗</span></button>
      </header>

      <section className="candidate-form-wrap">
        {showPortalBack && <button type="button" onClick={navigateBack} className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/80">← Kembali ke Portal</button>}
        <div className="candidate-form-heading">
          <span className="candidate-kicker">PENDAFTARAN KANDIDAT</span>
          <h1>Form kandidat baru</h1>
          <p>Isi data diri dan tautan thread CV forum untuk memulai proses seleksi.</p>
          {activeBatch ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="candidate-announcement w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-center text-xs text-emerald-800 sm:text-sm">
                Batas Pendaftaran <strong>{publicBatchName(activeBatch.name)}</strong>: {formatRegistrationDeadline(activeBatch.registration_end)}
              </p>
              {staffGraceActive && (
                <span title="Input internal tersedia hingga 24 jam setelah jadwal pendaftaran berakhir." className="inline-flex rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                  Akses Staff: Masa Tenggang H+1 Aktif
                </span>
              )}
            </div>
          ) : (
            <p className="candidate-announcement mt-3 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-xs font-medium text-amber-800 dark:border dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300 sm:text-sm">
              Pendaftaran belum dibuka. Kembali saat batch baru tersedia.
            </p>
          )}
        </div>

        <form onSubmit={handleCandSubmit} className="candidate-form space-y-3.5">
          <label htmlFor="candidate-cid">CID / Nomor Identitas <span>*</span></label>
          <input
            id="candidate-cid"
            type="text"
            required
            maxLength={40}
            autoComplete="off"
            autoCapitalize="characters"
            value={candForm.cid}
            onChange={(event) => setCandForm({ ...candForm, cid: event.target.value.toUpperCase() })}
            placeholder="Contoh: F8B84829"
          />

          <label htmlFor="candidate-name">Nama lengkap <span>*</span></label>
          <input
            id="candidate-name"
            type="text"
            required
            autoComplete="name"
            value={candForm.nama}
            onChange={(event) => setCandForm({ ...candForm, nama: event.target.value })}
            placeholder="Masukkan nama lengkap"
          />

          <label htmlFor="candidate-gender">Gender <span>*</span></label>
          <select
            id="candidate-gender"
            required
            value={candForm.gender}
            onChange={(event) => setCandForm({ ...candForm, gender: event.target.value })}
          >
            <option value="">Pilih gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>

          <label htmlFor="candidate-cv">Tautan thread CV <span>*</span></label>
          <input
            id="candidate-cv"
            type="url"
            required
            inputMode="url"
            value={candForm.linkCv}
            onChange={(event) => setCandForm({ ...candForm, linkCv: event.target.value })}
            placeholder="https://forum.example/..."
          />
          <p className="candidate-field-hint">Pastikan thread CV dapat dibuka oleh tim rekrutmen.</p>

          {alert.show && <div role="status" aria-live="polite" className={`candidate-alert ${alert.type}`}>{cooldownSeconds > 0 && alert.msg.toLowerCase().includes('terlalu banyak mencoba') ? `Terlalu banyak mencoba. Silakan tunggu ${cooldownMessage} lagi.` : alert.msg}</div>}

          <button className="candidate-submit dark:disabled:border dark:disabled:border-emerald-900/40 dark:disabled:bg-emerald-950/60 dark:disabled:text-emerald-700/60" type="submit" disabled={loading || !activeBatch || cooldownSeconds > 0}>
            {loading ? 'Mengirim pendaftaran…' : cooldownSeconds > 0 ? `Tunggu ${cooldownMessage}` : 'Kirim pendaftaran'}
            {!loading && <span aria-hidden="true">→</span>}
          </button>
          <p className="candidate-required-note dark:text-slate-400">Kolom bertanda * wajib diisi.</p>
        </form>
      </section>
      {showCancelModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCancelModal(false); }}>
        <section role="alertdialog" aria-modal="true" aria-labelledby="cancel-candidate-title" aria-describedby="cancel-candidate-description" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#161d19]">
          <h2 id="cancel-candidate-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">⚠️ Batalkan Pengisian Form?</h2>
          <p id="cancel-candidate-description" className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">Data kandidat yang telah Anda ketik belum disimpan. Apakah Anda yakin ingin keluar dan membatalkan pengisian?</p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" autoFocus onClick={() => setShowCancelModal(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">Lanjutkan Mengisi</button>
            <button type="button" onClick={confirmCancelForm} className="rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-800 dark:bg-rose-800 dark:hover:bg-rose-700">Ya, Batalkan &amp; Kembali</button>
          </div>
        </section>
      </div>}
      <footer className="candidate-footer">RNT | Recruitment and Training <span>·</span> RECRUITMENT MANAGEMENT</footer>
    </main>
  );
}
