'use client';

import { useEffect, useState } from 'react';
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
        <Link href="/" className="candidate-brand"><span>Recruitment and Training<small>Personnel Portal</small></span></Link>
        <Link href="/internal/select-batch" className="candidate-staff-link">Portal staff <span>↗</span></Link>
      </header>

      <section className="candidate-form-wrap">
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
      <footer className="candidate-footer">RNT | Recruitment and Training <span>·</span> RECRUITMENT MANAGEMENT</footer>
    </main>
  );
}
