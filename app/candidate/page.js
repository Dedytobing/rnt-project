'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function CandidatePage() {
  const [candForm, setCandForm] = useState({ nama: '', gender: '', linkCv: '' });
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ show: false, msg: '', type: '' });

  const handleCandSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setAlert({ show: false, msg: '', type: '' });

    try {
      const response = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ADD_CANDIDATE', ...candForm }),
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
        <Link href="/" className="candidate-brand"><span className="candidate-brand-mark">R</span><span>RED Project<small>Recruitment</small></span></Link>
        <Link href="/internal/dashboard" className="candidate-staff-link">Portal staff <span>↗</span></Link>
      </header>

      <section className="candidate-form-wrap">
        <div className="candidate-form-heading">
          <span className="candidate-kicker">PENDAFTARAN KANDIDAT</span>
          <h1>Form kandidat baru</h1>
          <p>Isi data diri dan tautan thread CV forum untuk memulai proses seleksi.</p>
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

          <button className="candidate-submit" type="submit" disabled={loading}>
            {loading ? 'Mengirim pendaftaran…' : 'Kirim pendaftaran'}
            {!loading && <span aria-hidden="true">→</span>}
          </button>
          <p className="candidate-required-note">Kolom bertanda * wajib diisi.</p>
        </form>
      </section>
      <footer className="candidate-footer">RED PROJECT <span>·</span> RECRUITMENT MANAGEMENT</footer>
    </main>
  );
}
