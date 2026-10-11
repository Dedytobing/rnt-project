'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function PinGeneratorPage() {
  const [role, setRole] = useState('STAFF');
  const [adminKeyInput, setAdminKeyInput] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [adminVerified, setAdminVerified] = useState(false);
  const [pin, setPin] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (role === 'ADMIN' && !adminVerified) return undefined;
    let active = true;
    const refreshPin = async () => {
      try {
        const response = await fetch('/api/internal/pin-generator', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ role, ...(role === 'ADMIN' ? { adminKey } : {}) }),
        });
        const data = await response.json();
        if (!active) return;
        if (!response.ok) {
          setPin('');
          setError(data.error || 'PIN tidak dapat dimuat.');
          if (role === 'ADMIN' && response.status === 401) {
            setAdminKey('');
            setAdminKeyInput('');
            setAdminVerified(false);
          }
          return;
        }
        setPin(data.pin);
        setExpiresAt(data.expiresAt);
        setError('');
      } catch {
        if (active) setError('Tidak dapat terhubung ke layanan generator.');
      } finally {
        if (active) setLoading(false);
      }
    };
    refreshPin();
    const refreshTimer = window.setInterval(refreshPin, 25000);
    return () => { active = false; window.clearInterval(refreshTimer); };
  }, [role, adminKey, adminVerified]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 250);
    return () => window.clearInterval(timer);
  }, []);

  const copyPin = async () => {
    try {
      await navigator.clipboard.writeText(pin);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('PIN tidak dapat disalin. Silakan salin secara manual.');
    }
  };

  const verifyAdmin = (event) => {
    event.preventDefault();
    setError('');
    setPin('');
    setLoading(true);
    setAdminKey(adminKeyInput);
    setAdminVerified(true);
  };

  const secondsLeft = expiresAt ? Math.max(0, expiresAt - now) : 30;

  return (
    <main className="pin-generator-page min-h-screen bg-[#edf1ec] px-5 py-10 text-slate-800">
      <div className="mx-auto w-full max-w-lg">
        <Link href="/" className="rnt-back-link">← Kembali ke RNT</Link>
        <section className="mt-5 rounded-xl border border-[#e0e7df] bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6">
            <p className="text-xs font-bold tracking-[0.2em] text-[#315842]">RNT · AKSES INTERNAL</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Generator PIN Akses</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">PIN berganti setiap 30 detik dan otomatis terikat pada alamat IP/perangkat ini.</p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#edf1ec] p-1" role="tablist" aria-label="Pilih jenis PIN">
            {[
              ['STAFF', 'Staff'],
              ['ADMIN', 'Admin Team RNT'],
            ].map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={role === value}
                onClick={() => {
                  setRole(value); setPin(''); setLoading(value === 'STAFF'); setCopied(false); setError('');
                  if (value === 'STAFF') { setAdminKey(''); setAdminKeyInput(''); setAdminVerified(false); }
                }}
                className={`rounded-md px-4 py-2.5 text-sm font-bold transition ${role === value ? 'bg-[#254532] text-white shadow-sm' : 'text-slate-600 hover:text-[#254532]'}`}>
                {label}
              </button>
            ))}
          </div>

          {role === 'ADMIN' && !adminVerified ? (
            <form onSubmit={verifyAdmin} className="mt-5 space-y-3 rounded-xl border border-[#e0e7df] bg-[#f8faf8] p-5">
              <label htmlFor="admin-verification-code" className="block text-sm font-semibold text-slate-700">Kode verifikasi Admin</label>
              <input id="admin-verification-code" type="password" required autoComplete="current-password" value={adminKeyInput}
                onChange={(event) => setAdminKeyInput(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-mono text-sm text-slate-800 outline-none focus:border-[#315842]"
                placeholder="Masukkan kode dari Admin RNT" />
              <button type="submit" className="w-full rounded-lg bg-[#254532] px-4 py-3 text-sm font-bold text-white">Verifikasi dan tampilkan PIN Admin</button>
            </form>
          ) : <div className="mt-5 rounded-xl border border-[#e0e7df] bg-[#f8faf8] px-5 py-7 text-center">
            <p className="text-xs font-semibold tracking-[0.18em] text-slate-500">PIN {role === 'ADMIN' ? 'ADMIN TEAM RNT' : 'STAFF'} SAAT INI</p>
            <div className="my-4 font-mono text-5xl font-bold tracking-[0.22em] text-[#254532]" aria-live="polite">
              {pin || (loading ? '······' : '------')}
            </div>
            <p className="text-sm text-slate-500">Rotasi dalam <strong className="text-[#315842]">{secondsLeft} detik</strong></p>
            <button type="button" onClick={copyPin} disabled={!pin}
              className="mt-5 w-full rounded-lg bg-[#e7efe7] px-4 py-2.5 text-sm font-semibold text-[#254532] transition hover:bg-[#dce9dd] disabled:cursor-not-allowed disabled:opacity-50">
              {copied ? 'PIN tersalin' : 'Salin PIN'}
            </button>
          </div>}

          {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
        </section>
      </div>
    </main>
  );
}
