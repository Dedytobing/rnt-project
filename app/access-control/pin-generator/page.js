'use client';

import { useEffect, useState } from 'react';

export default function PinGeneratorPage() {
  const [role, setRole] = useState('STAFF');
  const [pin, setPin] = useState('');
  const [adminKeyInput, setAdminKeyInput] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (role === 'ADMIN' && !adminKey) return undefined;
    let active = true;

    const refreshPin = async () => {
      try {
        const response = await fetch('/api/internal/pin-generator', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ role, adminKey: role === 'ADMIN' ? adminKey : undefined }),
        });
        const data = await response.json();
        if (!active) return;
        if (!response.ok) {
          setPin('');
          setError(data.error || 'PIN tidak dapat dimuat.');
          if (role === 'ADMIN' && response.status === 401) {
            setAdminKey('');
            setAdminKeyInput('');
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
    const refreshTimer = window.setInterval(refreshPin, 5000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, [role, adminKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 250);
    return () => window.clearInterval(timer);
  }, []);

  const selectRole = (nextRole) => {
    setRole(nextRole);
    setPin('');
    setError('');
    setCopied(false);
    setLoading(nextRole === 'STAFF' || Boolean(adminKey));
  };

  const unlockAdminPin = (event) => {
    event.preventDefault();
    setError('');
    setPin('');
    setLoading(true);
    setAdminKey(adminKeyInput);
  };

  const copyPin = async () => {
    try {
      await navigator.clipboard.writeText(pin);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('PIN tidak dapat disalin. Silakan salin secara manual.');
    }
  };

  const lockAdminPin = () => {
    setAdminKey('');
    setAdminKeyInput('');
    setPin('');
    setError('');
    setLoading(false);
  };

  const secondsLeft = expiresAt ? Math.max(0, expiresAt - now) : 30;
  const adminUnlocked = role === 'ADMIN' && Boolean(adminKey) && Boolean(pin);

  return (
    <main className="pin-generator-page min-h-screen bg-[#edf1ec] px-5 py-10 text-slate-800">
      <div className="mx-auto w-full max-w-lg">
        <a href="/" className="rnt-back-link">← Kembali ke RNT</a>
        <section className="mt-5 rounded-xl border border-[#e0e7df] bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-7">
            <p className="text-xs font-bold tracking-[0.2em] text-[#315842]">RNT · AKSES INTERNAL</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Generator PIN Akses</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">PIN berganti otomatis setiap 30 detik. Akses PIN Admin dilindungi secara terpisah.</p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#edf1ec] p-1" role="tablist" aria-label="Pilih jenis PIN">
            {['STAFF', 'ADMIN'].map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={role === item}
                onClick={() => selectRole(item)}
                className={`rounded-md px-4 py-2.5 text-sm font-bold transition ${role === item ? 'bg-[#254532] text-white shadow-sm' : 'text-slate-600 hover:text-[#254532]'}`}
              >
                {item === 'ADMIN' ? 'Admin Team RNT' : 'Staff'}
              </button>
            ))}
          </div>

          {role === 'ADMIN' && !adminUnlocked ? (
            <form onSubmit={unlockAdminPin} className="mt-5 space-y-3 rounded-xl border border-[#e0e7df] bg-[#f8faf8] p-5">
              <label htmlFor="admin-generator-key" className="block text-sm font-semibold text-slate-700">Kunci akses PIN Admin</label>
              <input
                id="admin-generator-key"
                type="password"
                required
                autoComplete="current-password"
                value={adminKeyInput}
                onChange={(event) => setAdminKeyInput(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-mono text-sm text-slate-800 outline-none focus:border-[#315842] focus:ring-2 focus:ring-[#315842]/10"
                placeholder="Masukkan kunci khusus Admin"
              />
              <button type="submit" className="w-full rounded-lg bg-[#254532] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#315a41]">Tampilkan PIN Admin</button>
            </form>
          ) : (
            <div className="mt-5 rounded-xl border border-[#e0e7df] bg-[#f8faf8] px-5 py-7 text-center">
              <p className="text-xs font-semibold tracking-[0.18em] text-slate-500">PIN {role === 'ADMIN' ? 'ADMIN TEAM RNT' : 'STAFF'} SAAT INI</p>
              <div className="my-4 font-mono text-5xl font-bold tracking-[0.22em] text-[#254532]" aria-live="polite">
                {pin || (loading ? '······' : '------')}
              </div>
              <p className="text-sm text-slate-500">Rotasi dalam <strong className="text-[#315842]">{secondsLeft} detik</strong></p>
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={copyPin} disabled={!pin} className="flex-1 rounded-lg bg-[#e7efe7] px-4 py-2.5 text-sm font-semibold text-[#254532] transition hover:bg-[#dce9dd] disabled:cursor-not-allowed disabled:opacity-50">
                  {copied ? 'Tersalin' : 'Salin PIN'}
                </button>
                {role === 'ADMIN' && <button type="button" onClick={lockAdminPin} className="rounded-lg border border-[#d7e1d7] px-4 py-2.5 text-sm text-slate-600 transition hover:bg-white">Kunci</button>}
              </div>
            </div>
          )}

          {error && <p className="mt-4 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300" role="alert">{error}</p>}
        </section>
      </div>
    </main>
  );
}
