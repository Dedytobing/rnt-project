'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const STAFF_PROFILE_STORAGE_KEY = 'rnt_internal_profiles_v1';

export default function InternalLayout({ children }) {
  const pathname = usePathname();
  const [officerName, setOfficerName] = useState('');
  const [userRole, setUserRole] = useState('STAFF');
  const [inputName, setInputName] = useState('');
  const [inputRank, setInputRank] = useState('');
  const [inputPosition, setInputPosition] = useState('');
  const [inputDepartment, setInputDepartment] = useState('');
  const [inputRole, setInputRole] = useState('STAFF');
  const [inputPin, setInputPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [savedProfiles, setSavedProfiles] = useState([]);
  const [profileSelection, setProfileSelection] = useState('');
  const [showSavedProfiles, setShowSavedProfiles] = useState(false);
  const [rememberProfile, setRememberProfile] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const pageMeta = {
    '/internal/dashboard': ['Dashboard', 'Ringkasan aktivitas dan progres rekrutmen'],
    '/internal/review': ['Review CV', 'Evaluasi profil kandidat dan hasil MDT'],
    '/internal/interview': ['Interview panel', 'Wawancara dan rekomendasi penempatan'],
    '/internal/audit-logs': ['Audit log', 'Riwayat aktivitas personel RNT'],
    '/internal/placement': ['Penempatan akhir', 'Keputusan departemen khusus Team RNT'],
  };
  const [pageTitle, pageSubtitle] = pageMeta[pathname] || ['Portal personel', 'Sistem manajemen rekrutmen RNT Project'];
  const selectedSavedProfile = profileSelection !== '' ? savedProfiles[Number(profileSelection)] : null;
  const usingSavedProfile = Boolean(selectedSavedProfile) && !showSavedProfiles;

  useEffect(() => {
    let active = true;
    try {
      const storedProfiles = JSON.parse(localStorage.getItem(STAFF_PROFILE_STORAGE_KEY) || '[]');
      if (Array.isArray(storedProfiles)) {
        const validProfiles = storedProfiles.filter((profile) => (
          profile && ['STAFF', 'ADMIN'].includes(profile.role)
          && typeof profile.name === 'string'
          && typeof profile.rank === 'string'
          && typeof profile.position === 'string'
          && ['LSPD', 'LSSD'].includes(profile.department)
        ));
        queueMicrotask(() => {
          if (!active) return;
          setSavedProfiles(validProfiles);
          if (validProfiles.length > 0) {
            const profile = validProfiles[0];
            setProfileSelection('0');
            setInputRole(profile.role);
            setInputName(profile.name);
            setInputRank(profile.rank);
            setInputPosition(profile.position);
            setInputDepartment(profile.department);
          }
        });
      }
    } catch {
      // Ignore invalid or unavailable local profile storage.
    }

    fetch('/api/internal/session')
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        if (data.authenticated) {
          setOfficerName(data.officerName);
          setUserRole(data.userRole);
          setIsAuth(true);
          sessionStorage.setItem('officer_session', data.officerName);
          sessionStorage.setItem('officer_role', data.userRole);
        } else {
          sessionStorage.removeItem('officer_session');
          sessionStorage.removeItem('officer_role');
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setSessionReady(true);
      });
    return () => { active = false; };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setPinError('');
    try {
      const response = await fetch('/api/internal/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: inputName,
          role: inputRole,
          pin: inputPin,
          rank: inputRank,
          position: inputPosition,
          department: inputDepartment,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setPinError(data.error || 'Tidak dapat memverifikasi sesi.');
        return;
      }

      sessionStorage.setItem('officer_session', data.officerName);
      sessionStorage.setItem('officer_role', data.userRole);
      setOfficerName(data.officerName);
      setUserRole(data.userRole);
      setInputPin('');
      setIsAuth(true);
      if (rememberProfile) {
        const profile = {
          role: data.userRole,
          name: data.officerName,
          rank: data.officerRank,
          position: data.officerPosition || '',
          department: data.officerDepartment,
        };
        const profileId = `${profile.role}:${profile.name.toLocaleLowerCase()}:${profile.department}`;
        const updatedProfiles = [
          profile,
          ...savedProfiles.filter((saved) => `${saved.role}:${saved.name.toLocaleLowerCase()}:${saved.department}` !== profileId),
        ].slice(0, 8);
        try {
          localStorage.setItem(STAFF_PROFILE_STORAGE_KEY, JSON.stringify(updatedProfiles));
          setSavedProfiles(updatedProfiles);
        } catch {
          setPinError('Sesi berhasil masuk, tetapi profil tidak dapat disimpan di perangkat ini.');
        }
      }
    } catch {
      setPinError('Tidak dapat terhubung ke layanan autentikasi.');
    }
  };

  const applySavedProfile = (selectedIndex) => {
    const profile = savedProfiles[selectedIndex];
    if (!profile) return;
    setProfileSelection(String(selectedIndex));
    setShowSavedProfiles(false);
    setInputRole(profile.role);
    setInputName(profile.name);
    setInputRank(profile.rank);
    setInputPosition(profile.position);
    setInputDepartment(profile.department);
    setInputPin('');
    setPinError('');
  };

  const useOtherIdentity = () => {
    setProfileSelection('');
    setShowSavedProfiles(false);
    setInputRole('STAFF');
    setInputName('');
    setInputRank('');
    setInputPosition('');
    setInputDepartment('');
    setInputPin('');
    setPinError('');
  };

  const handleLogout = async () => {
    await fetch('/api/internal/session', { method: 'DELETE' }).catch(() => {});
    sessionStorage.removeItem('officer_session');
    sessionStorage.removeItem('officer_role');
    setOfficerName('');
    setUserRole('STAFF');
    setIsAuth(false);
  };

  if (!sessionReady) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-sm text-slate-500">Memeriksa sesi staff…</p></div>;
  }

  if (!isAuth) {
    return (
      <div className="staff-login-page">
        <div className="staff-login-card text-center shadow-2xl">
          <div className="staff-login-back-row">
            <Link
              href="/"
              className="staff-login-back-link"
            >
              <span aria-hidden="true">←</span>
              Kembali
            </Link>
          </div>
          <div className="staff-login-heading">
            <div className="staff-login-mark w-14 h-14 bg-[#254532] rounded-2xl flex items-center justify-center mx-auto text-white font-black text-2xl shadow-lg shadow-[#254532]/20">R</div>
            <div>
              <span className="staff-login-eyebrow">AKSES PERSONEL RNT</span>
              <h2 className="text-xl font-bold text-white">RNT Internal Portal</h2>
              <p className="text-xs text-slate-400 mt-1">Lengkapi identitas dinas, peran, dan PIN portal internal.</p>
            </div>
          </div>

          {pinError && (
            <div className="staff-login-error p-3 bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold rounded-lg">
              {pinError}
            </div>
          )}
          
          <form onSubmit={handleLogin} className="staff-login-form text-left">
            {savedProfiles.length > 0 && (
              <div className="staff-login-profiles space-y-2">
                {showSavedProfiles ? (
                  <div className="staff-login-profile-picker rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-700">Pilih profil tersimpan</p>
                      <button type="button" onClick={() => setShowSavedProfiles(false)} className="staff-login-text-link text-[10px] font-semibold">Batal</button>
                    </div>
                    <div className="space-y-2">
                      {savedProfiles.map((profile, index) => (
                        <button
                          key={`${profile.role}:${profile.name}:${profile.department}`}
                          type="button"
                          onClick={() => applySavedProfile(index)}
                          className="staff-login-profile-option flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-[#9ab49f] hover:bg-[#f3f7f2]"
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e7efe7] text-sm font-bold text-[#315842]">{profile.name.slice(0, 1).toUpperCase()}</span>
                          <span className="min-w-0 flex-1">
                            <strong className="block break-words text-xs text-slate-800">{profile.name}</strong>
                            <small className="mt-0.5 block break-words text-[10px] text-slate-500">{profile.rank} · {profile.role} · {profile.department}</small>
                          </span>
                          <span className="text-xs font-semibold text-[#315842]">Pilih</span>
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={useOtherIdentity} className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 hover:border-[#9ab49f] hover:text-[#315842]">Gunakan Identitas Lain</button>
                  </div>
                ) : usingSavedProfile ? (
                  <div>
                    <div className="staff-login-profile-picker grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-[#e7efe7] text-sm font-bold text-[#315842]">{selectedSavedProfile.name.slice(0, 1).toUpperCase()}</span>
                      <span className="min-w-0">
                        <strong className="block break-words text-sm leading-5 text-slate-900">{selectedSavedProfile.name}</strong>
                        <small className="mt-0.5 block break-words text-[11px] leading-4 text-slate-500">{selectedSavedProfile.rank}</small>
                      </span>
                      <button type="button" onClick={() => setShowSavedProfiles(true)} className="staff-login-text-link whitespace-nowrap text-[10px] font-semibold">Ganti Profil</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowSavedProfiles(true)} className="staff-login-profile-option w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-xs font-semibold text-slate-600 hover:border-[#9ab49f] hover:text-[#315842]">Pilih profil tersimpan</button>
                )}
              </div>
            )}

            {!usingSavedProfile && (
              <>
            <fieldset className="staff-login-roles form-span-all">
              <legend className="block text-xs font-bold text-slate-300 mb-2">Peran sesi *</legend>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'STAFF', label: 'Staff', detail: 'Evaluator / Interviewer' },
                  { id: 'ADMIN', label: 'Team RNT', detail: 'Akses admin' },
                ].map((role) => (
                  <label key={role.id} className={`staff-login-role ${inputRole === role.id ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="staff-role"
                      value={role.id}
                      checked={inputRole === role.id}
                      onChange={() => { setInputRole(role.id); setProfileSelection(''); }}
                    />
                    <span><strong>{role.label}</strong><small>{role.detail}</small></span>
                    <span className="staff-login-role-check" aria-hidden="true">✓</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="staff-login-field">
              <label className="block text-xs font-bold text-slate-300 mb-1">Nama Officer / Admin *</label>
              <input 
                type="text" 
                required
                className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg text-sm focus:outline-none focus:border-[#315842]" 
                placeholder="Contoh: Lucas D Riverra" 
                value={inputName} 
                onChange={e => { setInputName(e.target.value); setProfileSelection(''); }} 
              />
            </div>

            <div className="staff-login-field">
              <label className="block text-xs font-bold text-slate-300 mb-1">Pangkat *</label>
              <input
                type="text"
                required
                maxLength={60}
                className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg text-sm focus:outline-none focus:border-[#315842]"
                placeholder="Contoh: Lieutenant"
                value={inputRank}
                onChange={e => { setInputRank(e.target.value); setProfileSelection(''); }}
              />
            </div>

            <div className="staff-login-field form-span-all">
              <label className="block text-xs font-bold text-slate-300 mb-1">Divisi / jabatan <span className="font-normal text-slate-500">(opsional)</span></label>
              <input
                type="text"
                list="staff-position-options"
                maxLength={100}
                autoComplete="off"
                className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg text-sm focus:outline-none focus:border-[#315842]"
                placeholder="Pilih atau ketik divisi/jabatan"
                value={inputPosition}
                onChange={e => { setInputPosition(e.target.value); setProfileSelection(''); }}
              />
              <datalist id="staff-position-options">
                <option value="Recruitment And Training Division" />
                <option value="Personnel Services Officer" />
              </datalist>
              <p className="mt-1 text-left text-[10px] text-slate-500">Pilih saran atau ketik langsung pada kolom.</p>
            </div>

            <fieldset className="staff-login-departments form-span-all">
              <legend className="block text-xs font-bold text-slate-300 mb-2">Departemen *</legend>
              <p className="staff-login-department-hint">Pilih departemen yang akan dicantumkan pada tanda tangan balasan CV.</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'LSPD', name: 'Los Santos Police Department', logo: '/logos/lspd.png' },
                  { id: 'LSSD', name: 'Los Santos Sheriff Department', logo: '/logos/lssd.png' },
                ].map((department) => (
                  <label key={department.id} className={`staff-login-department ${inputDepartment === department.id ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="staff-department"
                      value={department.id}
                      aria-label={department.name}
                      required
                      checked={inputDepartment === department.id}
                      onChange={() => { setInputDepartment(department.id); setProfileSelection(''); }}
                    />
                    <span className="staff-department-logo"><Image src={department.logo} alt="" width={36} height={36} /></span>
                    <span className="staff-department-copy"><strong>{department.id}</strong><small>{department.name}</small></span>
                    <span className="staff-department-check" aria-hidden="true">✓</span>
                  </label>
                ))}
              </div>
            </fieldset>
              </>
            )}

            <div className="staff-login-field staff-login-pin-field">
              <label className="block text-xs font-bold text-slate-300 mb-1">
                PIN Akses {inputRole === 'ADMIN' ? 'Admin Team RNT' : 'Staff'} *
              </label>
              <input 
                id="pin-akses"
                type="password" 
                required
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg text-sm focus:outline-none focus:border-[#315842] tracking-widest font-mono text-lg" 
                style={{ textAlign: 'center', direction: 'ltr' }}
                placeholder="Masukkan PIN Akses" 
                value={inputPin} 
                onChange={e => setInputPin(e.target.value)} 
              />
            </div>

            {!usingSavedProfile && (
              <label className="staff-login-remember flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={rememberProfile}
                  onChange={(event) => setRememberProfile(event.target.checked)}
                className="h-4 w-4 accent-[#315842]"
                />
                Ingat profil ini di perangkat saya
              </label>
            )}

            <button type="submit" className="staff-login-submit w-full bg-[#254532] text-white py-3 rounded-lg font-bold text-sm hover:bg-[#315a41] transition shadow-lg shadow-[#254532]/20">
              Masuk Sesi {inputRole}
            </button>
          </form>

          <div className="staff-login-footer text-[10px] text-slate-500 pt-2 border-t border-slate-700/50">
            AKSES INTERNAL · RNT PROJECT PERSONNEL
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex staff-workspace">
      <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between p-6 shrink-0 staff-sidebar">
        <div className="space-y-6">
          <Link href="/internal/dashboard" className="flex items-center gap-3 staff-brand">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold">R</div>
            <span>RNT <small>PERSONNEL PORTAL</small></span>
            <span className="brand-pulse" aria-label="Sistem aktif" />
          </Link>

          <div className="nav-caption">WORKSPACE</div>
          <nav className="space-y-1">
            <Link href="/internal/dashboard" className={`staff-nav-link ${pathname === '/internal/dashboard' ? 'active' : ''}`}><span>▦</span>Ringkasan</Link>
            <Link href="/internal/review" className={`staff-nav-link ${pathname === '/internal/review' ? 'active' : ''}`}><span>⌕</span>Review CV</Link>
            <Link href="/internal/interview" className={`staff-nav-link ${pathname === '/internal/interview' ? 'active' : ''}`}><span>◷</span>Interview panel</Link>
            <Link href="/candidate" className="staff-nav-link"><span>＋</span>Input kandidat</Link>
            {userRole === 'ADMIN' && <>
              <Link href="/internal/placement" className={`staff-nav-link ${pathname === '/internal/placement' ? 'active' : ''}`}><span>⌖</span>Penempatan akhir<span className="nav-admin-tag">RNT</span></Link>
              <Link href="/internal/audit-logs" className={`staff-nav-link ${pathname === '/internal/audit-logs' ? 'active' : ''}`}><span>≡</span>Audit log<span className="nav-admin-tag">RNT</span></Link>
            </>}
          </nav>
        </div>

        <div className="border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-400">Pengguna Aktif:</span>
            <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
              userRole === 'ADMIN' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            }`}>
              {userRole === 'ADMIN' ? 'TEAM RNT' : 'STAFF'}
            </span>
          </div>
          <div className="font-bold text-sm text-white truncate mb-3">{officerName}</div>
          <button onClick={handleLogout} className="w-full bg-rose-600/20 text-rose-400 border border-rose-600/30 text-xs py-2 rounded font-semibold hover:bg-rose-600 hover:text-white transition">
            Keluar Sesi
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto staff-main">
        <header className="staff-topbar">
          <div><div className="staff-breadcrumb">RNT PROJECT <span>/</span> PERSONNEL</div><h1>{pageTitle}</h1><p>{pageSubtitle}</p></div>
          <div className="staff-top-actions"><span className="staff-live"><i /> SISTEM AKTIF</span><Link href="/candidate" className="staff-new-candidate"><span>＋</span> Kandidat baru</Link></div>
        </header>
        <div className="staff-content">{children}</div>
      </main>
    </div>
  );
}
