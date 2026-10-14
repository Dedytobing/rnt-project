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
  const [candForm, setCandForm] = useState({ nama: '', gender: '', linkCv: '' });
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ show: false, msg: '', type: '' });
  const [activeBatch, setActiveBatch] = useState(null);
  const [showPortalBack, setShowPortalBack] = useState(false);
  const [portalReturnTo, setPortalReturnTo] = useState('/internal/dashboard');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const hasUnsavedChanges = Boolean(candForm.nama || candForm.gender || candForm.linkCv);

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
    fetch('/api/batches', { cache: 'no-store' }).then((response) => response.json())
      .then((data) => { if (data.success) setActiveBatch(data.batch); })
      .catch(() => setActiveBatch(null));
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
        setAlert({ show: true, msg: data.message || 'Pendaftaran berhasil dikirim.', type: 'success' });
        setCandForm({ nama: '', gender: '', linkCv: '' });
      } else {
        setAlert({ show: true, msg: data.error || 'Pendaftaran belum dapat dikirim.', type: 'error' });
      }
    } catch {
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
        {showPortalBack && <button type="button" onClick={navigateBack} className="mb-5 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/80">← Kembali ke Portal</button>}
        <div className="candidate-form-heading">
          <span className="candidate-kicker">PENDAFTARAN KANDIDAT</span>
          <h1>Form kandidat baru</h1>
          <p>Isi data diri dan tautan thread CV forum untuk memulai proses seleksi.</p>
          {activeBatch ? <p className="candidate-announcement mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Pendaftaran <strong>{publicBatchName(activeBatch.name)}</strong> resmi dibuka sampai {formatRegistrationDeadline(activeBatch.registration_end)}.</p> : <p className="candidate-announcement mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Pendaftaran belum dibuka. Silakan kembali saat batch baru tersedia.</p>}
        </div>

        <form onSubmit={handleCandSubmit} className="candidate-form">
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

          {alert.show && <div role="status" className={`candidate-alert ${alert.type}`}>{alert.msg}</div>}

          <button className="candidate-submit" type="submit" disabled={loading || !activeBatch}>
            {loading ? 'Mengirim pendaftaran…' : 'Kirim pendaftaran'}
            {!loading && <span aria-hidden="true">→</span>}
          </button>
          <p className="candidate-required-note">Kolom bertanda * wajib diisi.</p>
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
