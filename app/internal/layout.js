'use client';
import { Suspense, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { getBatchStatus } from '@/lib/batch-status';
import { BatchContext } from './BatchContext';

const SELECTED_BATCH_STORAGE_KEY = 'rnt_selected_batch_id';
const BUSINESS_TIME_ZONE = 'Asia/Jakarta';
const REMEMBERED_PROFILE_STORAGE_KEY = 'rnt_personnel_profile';

function batchSlug(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'batch';
}

function slugForBatch(batch, batches) {
  const base = batchSlug(batch.name);
  const collisions = batches.filter((item) => batchSlug(item.name) === base);
  return collisions.length > 1 ? `${base}-${batch.id.slice(0, 6)}` : base;
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: BUSINESS_TIME_ZONE }).format(new Date(value));
}

function formatRange(start, end) {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function formatDateTime(value) {
  if (!value) return '';
  const parsed = parseDateTimeInput(value);
  if (!parsed) return value;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(parsed);
}

function formatSystemServerTime(timestamp) {
  const dateParts = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', timeZone: BUSINESS_TIME_ZONE,
  }).formatToParts(timestamp);
  const timeParts = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: BUSINESS_TIME_ZONE,
  }).formatToParts(timestamp);
  const partValue = (parts, type) => parts.find((part) => part.type === type)?.value || '';
  return {
    time: `${partValue(timeParts, 'hour')}:${partValue(timeParts, 'minute')}:${partValue(timeParts, 'second')}`,
    date: `${partValue(dateParts, 'day')} ${partValue(dateParts, 'month')}`,
  };
}

function toDateTimeInput(value) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map(({ type, value: partValue }) => [type, partValue]));
  return `${fields.day}/${fields.month}/${fields.year} ${fields.hour}:${fields.minute}`;
}

function fromDateTimeInput(value) {
  const date = parseDateTimeInput(value);
  return date ? date.toISOString() : '';
}

function parseDateTimeInput(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const [, dayText, monthText, yearText, hourText, minuteText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (month < 1 || month > 12 || hour > 23 || minute > 59) return null;
  if (day < 1) return null;
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) return null;
  // Jakarta uses UTC+7; convert the entered WIB wall time to an absolute instant.
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
}

function formatDateTimeMask(digits) {
  const value = digits.slice(0, 12);
  return `${value.slice(0, 2)}${value.length > 2 ? `/${value.slice(2, 4)}` : ''}${value.length > 4 ? `/${value.slice(4, 8)}` : ''}${value.length > 8 ? ` ${value.slice(8, 10)}` : ''}${value.length > 10 ? `:${value.slice(10, 12)}` : ''}`;
}

function pickerParts(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return { date: '', time: '' };
  return { date: `${match[3]}-${match[2]}-${match[1]}`, time: `${match[4]}:${match[5]}` };
}

function DateTimeField({ value, onChange, label }) {
  const parts = pickerParts(value);
  const handleTextChange = (event) => {
    const input = event.currentTarget;
    const caret = input.selectionStart || 0;
    const digitsBeforeCaret = input.value.slice(0, caret).replace(/\D/g, '').length;
    const digits = input.value.replace(/\D/g, '').slice(0, 12);
    onChange(formatDateTimeMask(digits));
    const separatorCount = Number(digitsBeforeCaret > 2) + Number(digitsBeforeCaret > 4) + Number(digitsBeforeCaret > 8) + Number(digitsBeforeCaret > 10);
    requestAnimationFrame(() => input.setSelectionRange(digitsBeforeCaret + separatorCount, digitsBeforeCaret + separatorCount));
  };
  const handleDatePicker = (event) => {
    if (!event.target.value) return;
    const [year, month, day] = event.target.value.split('-');
    const time = parts.time || '00:00';
    onChange(`${day}/${month}/${year} ${time}`);
  };
  const handleTimePicker = (event) => {
    if (!event.target.value) return;
    const date = parts.date || toDateTimeInput(new Date().toISOString()).slice(0, 10).split('/').reverse().join('-');
    const [year, month, day] = date.split('-');
    onChange(`${day}/${month}/${year} ${event.target.value}`);
  };
  return <div className="batch-datetime-field">
    <input type="text" required inputMode="numeric" autoComplete="off" spellCheck="false" value={value || ''} onChange={handleTextChange} placeholder="DD/MM/YYYY HH:mm" aria-label={`${label}, format tanggal dan waktu DD/MM/YYYY HH:mm`} pattern="[0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{2}:[0-9]{2}" title="Gunakan format DD/MM/YYYY HH:mm" className="batch-datetime-text mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    <div className="batch-datetime-pickers" aria-label={`Pemilih visual ${label}`}>
      <label className="batch-datetime-picker-button" title="Pilih tanggal"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="4.5" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M6.5 2.5v4M13.5 2.5v4M3.5 8h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg><input type="date" value={parts.date} onChange={handleDatePicker} aria-label={`Pilih tanggal ${label}`} /></label>
      <label className="batch-datetime-picker-button" title="Pilih jam"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10 5.5v4.8l3 1.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg><input type="time" value={parts.time} onChange={handleTimePicker} aria-label={`Pilih jam ${label}`} /></label>
    </div>
  </div>;
}

function batchStatus(batch, now) {
  const status = getBatchStatus(batch, now);
  if (status === 'scheduled') return { label: 'Terjadwal', className: 'bg-sky-100 text-sky-800 ring-sky-200' };
  if (status === 'completed') return { label: 'Selesai', className: 'bg-slate-100 text-slate-600 ring-slate-200' };
  return { label: 'Aktif', className: 'bg-emerald-100 text-emerald-800 ring-emerald-200' };
}

function InternalLayoutContent({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [officerName, setOfficerName] = useState('');
  const [officerRank, setOfficerRank] = useState('');
  const [officerPosition, setOfficerPosition] = useState('');
  const [officerDepartment, setOfficerDepartment] = useState('');
  const [userRole, setUserRole] = useState('STAFF');
  const [inputName, setInputName] = useState('');
  const [inputRank, setInputRank] = useState('');
  const [inputPosition, setInputPosition] = useState('');
  const [inputDepartment, setInputDepartment] = useState('');
  const [inputRole, setInputRole] = useState('STAFF');
  const [inputPin, setInputPin] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [rememberProfile, setRememberProfile] = useState(false);
  const [savedProfile, setSavedProfile] = useState(null);
  const [useSavedProfile, setUseSavedProfile] = useState(false);
  const [pinError, setPinError] = useState('');
  const [roleToast, setRoleToast] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const [isAuth, setIsAuth] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [batches, setBatches] = useState([]);
  const [batchLoading, setBatchLoading] = useState(true);
  const [batchError, setBatchError] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [showBatchPicker, setShowBatchPicker] = useState(true);
  const [batchEditor, setBatchEditor] = useState(null);
  const [batchForm, setBatchForm] = useState({});
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchFormError, setBatchFormError] = useState('');
  const [serverClockNow, setServerClockNow] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const initialPathnameRef = useRef(pathname);
  useEffect(() => {
    let active = true;
    let serverOffset = null;
    const syncServerTime = async () => {
      const requestStartedAt = performance.now();
      try {
        const response = await fetch('/api/internal/server-time', { cache: 'no-store' });
        const result = await response.json();
        const responseReceivedAt = performance.now();
        if (!response.ok || !Number.isFinite(result.serverTime)) throw new Error('Server time unavailable');
        serverOffset = result.serverTime - (requestStartedAt + responseReceivedAt) / 2;
        if (active) setServerClockNow(responseReceivedAt + serverOffset);
      } catch {
        if (active && serverOffset === null) setServerClockNow(null);
      }
    };
    void syncServerTime();
    const ticker = window.setInterval(() => {
      if (active && serverOffset !== null) setServerClockNow(performance.now() + serverOffset);
    }, 1000);
    const resync = window.setInterval(() => { void syncServerTime(); }, 60000);
    return () => {
      active = false;
      window.clearInterval(ticker);
      window.clearInterval(resync);
    };
  }, []);
  useEffect(() => {
    if (!roleToast) return undefined;
    const timer = window.setTimeout(() => setRoleToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [roleToast]);
  useEffect(() => {
    if (rateLimitSeconds <= 0) return undefined;
    const timer = window.setTimeout(() => setRateLimitSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [rateLimitSeconds]);
  const pageMeta = {
    '/internal/dashboard': ['Dashboard', 'Ringkasan aktivitas dan progres rekrutmen'],
    '/internal/review': ['Review CV', 'Evaluasi profil kandidat dan hasil MDT'],
    '/internal/interview': ['Interview panel', 'Wawancara dan rekomendasi penempatan'],
    '/internal/audit-logs': ['Audit log', 'Riwayat aktivitas personel RNT'],
    '/internal/management': ['Manajemen PIC', 'Pembagian tanggung jawab Academy per batch'],
    '/internal/academy': ['Absensi Academy', 'Kehadiran kandidat dan PIC batch'],
    '/internal/absensi': ['Absensi Academy', 'Kehadiran kandidat dan PIC batch'],
    '/internal/audit-log': ['Audit log', 'Riwayat aktivitas personel RNT'],
  };
  const routeSection = pathname.split('/')[3] || '';
  const [pageTitle, pageSubtitle] = pageMeta[pathname] || pageMeta[`/internal/${routeSection}`] || ['Portal personel', 'Sistem manajemen rekrutmen RNT Project'];
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedProfile = JSON.parse(localStorage.getItem(REMEMBERED_PROFILE_STORAGE_KEY) || 'null');
        if (savedProfile && typeof savedProfile === 'object') {
          setSavedProfile(savedProfile);
          setInputName(savedProfile.name || '');
          setInputRank(savedProfile.rank || '');
          setInputPosition(savedProfile.position || '');
          setInputDepartment(savedProfile.department || '');
          setInputRole(savedProfile.role || 'STAFF');
          setRememberProfile(true);
          setUseSavedProfile(Boolean(savedProfile.name && savedProfile.rank && savedProfile.department));
        }
      } catch {
        localStorage.removeItem(REMEMBERED_PROFILE_STORAGE_KEY);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/internal/session')
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        if (data.authenticated) {
          setOfficerName(data.officerName);
          setUserRole(data.userRole);
          setOfficerRank(data.officerRank || '');
          setOfficerPosition(data.officerPosition || '');
          setOfficerDepartment(data.officerDepartment || '');
          setIsAuth(true);
          sessionStorage.setItem('officer_session', data.officerName);
          sessionStorage.setItem('officer_role', data.userRole);
          setSelectedBatchId('');
          setShowBatchPicker(initialPathnameRef.current === '/internal/select-batch');
          setPinVerified(false);
        } else if (data.pinVerified) {
          const profile = {
            name: data.officerName,
            rank: data.officerRank || '',
            position: data.officerPosition || '',
            department: data.officerDepartment || '',
            role: data.userRole,
          };
          setSavedProfile(profile);
          setInputName(profile.name);
          setInputRank(profile.rank);
          setInputPosition(profile.position);
          setInputDepartment(profile.department);
          setInputRole(profile.role);
          setInputPin('');
          setUseSavedProfile(true);
          setPinVerified(true);
        } else {
          setPinVerified(false);
          sessionStorage.removeItem('officer_session');
          sessionStorage.removeItem('officer_role');
          sessionStorage.removeItem(SELECTED_BATCH_STORAGE_KEY);
          localStorage.removeItem(SELECTED_BATCH_STORAGE_KEY);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setSessionReady(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isAuth) return undefined;
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setBatchLoading(true);
        setBatchError('');
      }
    });
    fetch('/api/internal/batches', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Daftar batch gagal dimuat.');
        if (!active) return;
        const availableBatches = result.batches || [];
        setBatches(availableBatches);
        const storedBatch = localStorage.getItem(SELECTED_BATCH_STORAGE_KEY) || sessionStorage.getItem(SELECTED_BATCH_STORAGE_KEY) || '';
        if (!storedBatch || !availableBatches.some((batch) => batch.id === storedBatch)) {
          sessionStorage.removeItem(SELECTED_BATCH_STORAGE_KEY);
          localStorage.removeItem(SELECTED_BATCH_STORAGE_KEY);
        }
      })
      .catch((error) => { if (active) setBatchError(error.message || 'Daftar batch gagal dimuat.'); })
      .finally(() => { if (active) setBatchLoading(false); });
    return () => { active = false; };
  }, [isAuth]);

  useEffect(() => {
    if (!isAuth || batchLoading || !batches.length) return;
    queueMicrotask(() => {
      if (pathname === '/internal/select-batch') {
        setSelectedBatchId('');
        setShowBatchPicker(true);
        return;
      }
      const match = pathname.match(/^\/internal\/([^/]+)\/([^/]+)$/);
      const batch = match ? batches.find((item) => slugForBatch(item, batches) === match[1]) : null;
      if (!batch) {
        setSelectedBatchId('');
        setShowBatchPicker(true);
        router.replace('/internal/select-batch');
        return;
      }
      localStorage.setItem(SELECTED_BATCH_STORAGE_KEY, batch.id);
      sessionStorage.setItem(SELECTED_BATCH_STORAGE_KEY, batch.id);
      setSelectedBatchId(batch.id);
      setShowBatchPicker(false);
    });
  }, [isAuth, batchLoading, batches, pathname, router]);

  useEffect(() => {
    if (!showBatchPicker) return undefined;
    const updateTime = () => setCurrentTime(Date.now());
    const timer = window.setInterval(updateTime, 60_000);
    queueMicrotask(updateTime);
    return () => window.clearInterval(timer);
  }, [showBatchPicker]);

  useEffect(() => {
    if (!userMenuOpen) return undefined;
    const closeMenu = (event) => {
      if (event.type === 'keydown' && event.key === 'Escape') setUserMenuOpen(false);
      if (event.type === 'mousedown' && !userMenuRef.current?.contains(event.target)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeMenu);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeMenu);
    };
  }, [userMenuOpen]);

  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId) || null;
  const serverClockDisplay = serverClockNow === null ? null : formatSystemServerTime(serverClockNow);

  const chooseBatch = (batchId) => {
    const batch = batches.find((item) => item.id === batchId);
    if (!batch) return;
    localStorage.setItem(SELECTED_BATCH_STORAGE_KEY, batch.id);
    sessionStorage.setItem(SELECTED_BATCH_STORAGE_KEY, batch.id);
    setSelectedBatchId(batch.id);
    setShowBatchPicker(false);
    router.push(`/internal/${slugForBatch(batch, batches)}/dashboard`);
  };

  const reloadBatches = () => {
    setBatchError('');
    setBatchLoading(true);
    fetch('/api/internal/batches', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Daftar batch gagal dimuat.');
        const availableBatches = result.batches || [];
        setBatches(availableBatches);
        if (selectedBatchId && !availableBatches.some((batch) => batch.id === selectedBatchId)) {
          sessionStorage.removeItem(SELECTED_BATCH_STORAGE_KEY);
          localStorage.removeItem(SELECTED_BATCH_STORAGE_KEY);
          setSelectedBatchId('');
        }
      })
      .catch((error) => setBatchError(error.message || 'Daftar batch gagal dimuat.'))
      .finally(() => setBatchLoading(false));
  };

  const openBatchEditor = (batch = null) => {
    setBatchForm(batch ? {
      id: batch.id,
      name: batch.name,
      registration_start: toDateTimeInput(batch.registration_start),
      registration_end: toDateTimeInput(batch.registration_end),
      interview_start: toDateTimeInput(batch.interview_start),
      interview_end: toDateTimeInput(batch.interview_end),
      academy_start: toDateTimeInput(batch.academy_start),
      academy_end: toDateTimeInput(batch.academy_end),
    } : { name: '', registration_start: '', registration_end: '', interview_start: '', interview_end: '', academy_start: '', academy_end: '' });
    setBatchFormError('');
    setBatchEditor(batch ? 'edit' : 'create');
  };

  const saveBatch = async (event) => {
    event.preventDefault();
    setBatchSaving(true);
    setBatchFormError('');
    const fields = { ...batchForm };
    delete fields.id;
    const scheduleKeys = Object.keys(fields).filter((key) => key.endsWith('_start') || key.endsWith('_end'));
    if (scheduleKeys.some((key) => !parseDateTimeInput(fields[key]))) {
      setBatchFormError('Isi seluruh tanggal dan waktu dengan format DD/MM/YYYY HH:mm yang valid.');
      setBatchSaving(false);
      return;
    }
    for (const key of scheduleKeys) fields[key] = fromDateTimeInput(fields[key]);
    try {
      const response = await fetch('/api/internal/batches', {
        method: batchEditor === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchEditor === 'edit' ? { id: batchForm.id, ...fields } : fields),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Batch gagal disimpan.');
      setBatchEditor(null);
      reloadBatches();
    } catch (error) {
      setBatchFormError(error.message || 'Batch gagal disimpan.');
    } finally {
      setBatchSaving(false);
    }
  };

  const deleteBatch = async (batch) => {
    if (!window.confirm(`Hapus batch “${batch.name}”? Batch akan disembunyikan dan dapat dipulihkan dari database.`)) return;
    setBatchError('');
    try {
      const response = await fetch('/api/internal/batches', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: batch.id }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Batch gagal dihapus.');
      if (selectedBatchId === batch.id) {
        sessionStorage.removeItem(SELECTED_BATCH_STORAGE_KEY);
        localStorage.removeItem(SELECTED_BATCH_STORAGE_KEY);
        setSelectedBatchId('');
      }
      reloadBatches();
    } catch (error) {
      setBatchError(error.message || 'Batch gagal dihapus.');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isLoggingIn) return;
    setPinError('');
    setRoleToast(null);
    setIsLoggingIn(true);
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
        if (!inputPin && response.status === 401) setPinVerified(false);
        if (response.status === 429) {
          setRateLimitSeconds(Math.max(1, Number(data.retryAfter) || Number(response.headers.get('Retry-After')) || 1));
          setPinError('');
          return;
        }
        if (data.code === 'ROLE_MISMATCH') {
          setRoleToast({ name: data.name || inputName.trim(), role: data.registeredRole || 'STAFF' });
          return;
        }
        setPinError(data.error || 'Tidak dapat memverifikasi sesi.');
        return;
      }

      if (rememberProfile) {
        const profile = {
          name: inputName,
          rank: inputRank,
          position: inputPosition,
          department: inputDepartment,
          role: inputRole,
        };
        localStorage.setItem(REMEMBERED_PROFILE_STORAGE_KEY, JSON.stringify(profile));
        setSavedProfile(profile);
      } else {
        localStorage.removeItem(REMEMBERED_PROFILE_STORAGE_KEY);
        setSavedProfile(null);
      }

      sessionStorage.setItem('officer_session', data.officerName);
      sessionStorage.setItem('officer_role', data.userRole);
      setOfficerName(data.officerName);
      setUserRole(data.userRole);
      setOfficerRank(data.officerRank || inputRank);
      setOfficerPosition(data.officerPosition || inputPosition);
      setOfficerDepartment(data.officerDepartment || inputDepartment);
      setInputPin('');
      setPinVerified(false);
      sessionStorage.removeItem(SELECTED_BATCH_STORAGE_KEY);
      localStorage.removeItem(SELECTED_BATCH_STORAGE_KEY);
      setSelectedBatchId('');
      setShowBatchPicker(true);
      setBatchLoading(true);
      setIsAuth(true);
      router.replace('/internal/select-batch');
    } catch {
      setPinError('Tidak dapat terhubung ke layanan autentikasi.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/internal/session', { method: 'DELETE' }).catch(() => {});
    const lockedProfile = {
      name: officerName,
      rank: officerRank,
      position: officerPosition,
      department: officerDepartment,
      role: userRole,
    };
    setSavedProfile(lockedProfile);
    setInputName(lockedProfile.name);
    setInputRank(lockedProfile.rank);
    setInputPosition(lockedProfile.position);
    setInputDepartment(lockedProfile.department);
    setInputRole(lockedProfile.role);
    setInputPin('');
    setUseSavedProfile(true);
    setPinVerified(true);
    sessionStorage.removeItem('officer_session');
    sessionStorage.removeItem('officer_role');
    sessionStorage.removeItem(SELECTED_BATCH_STORAGE_KEY);
    localStorage.removeItem(SELECTED_BATCH_STORAGE_KEY);
    setOfficerName('');
    setUserRole('STAFF');
    setOfficerRank('');
    setOfficerPosition('');
    setOfficerDepartment('');
    setUserMenuOpen(false);
    setSelectedBatchId('');
    setShowBatchPicker(true);
    setBatches([]);
    setIsAuth(false);
  };

  if (!sessionReady) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><p className="text-sm text-slate-500">Memeriksa sesi staff…</p></div>;
  }

  if (!isAuth) {
    return (
      <div className="staff-login-page">
          {roleToast && <aside className="staff-role-toast" role="alert" aria-live="assertive"><span className="staff-role-toast-icon" aria-hidden="true">!</span><div className="staff-role-toast-copy"><strong>Akses Peran Tidak Sesuai</strong><p><b>{roleToast.name}</b> terdaftar sebagai <b>{roleToast.role}</b>. Silakan sesuaikan Pilihan Peran Sesi.</p></div><button type="button" onClick={() => setRoleToast(null)} aria-label="Tutup pemberitahuan" className="staff-role-toast-close">×</button></aside>}
        <div className="staff-login-card text-center shadow-2xl">
          <div className="staff-login-back-row">
            <Link
              href="/"
              className="staff-login-back-link"
            >
              {/* <span aria-hidden="true">←</span> */}
              Kembali
            </Link>
          </div>
          <div className="staff-login-heading">
            <div>
              <h2 className="text-xl font-bold text-white">RNT Internal Portal</h2>
              <p className="text-xs text-slate-400 mt-1">{pinVerified ? 'Profil tersimpan dan verifikasi PIN masih aktif selama 24 jam.' : 'Lengkapi identitas dinas, peran, dan PIN portal internal.'}</p>
            </div>
          </div>

          {pinError && (
              <div className="staff-login-error p-3 bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold rounded-lg">
              {pinError}
            </div>
          )}
            {rateLimitSeconds > 0 && (
              <div className="staff-login-error p-3 bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-200 text-xs font-bold rounded-lg" role="status" aria-live="polite">
                Terlalu banyak mencoba. Silakan tunggu {rateLimitSeconds} detik lagi.
              </div>
            )}
          
          <form onSubmit={handleLogin} className="staff-login-form text-left">
            {useSavedProfile && savedProfile ? <>
              <div className="staff-login-profile-picker form-span-all flex items-center justify-between gap-3 border p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="staff-login-avatar grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e7efe7] font-bold text-[#1E3A2B]">{(savedProfile.name || 'R').slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 text-left"><strong className="block truncate text-sm">{savedProfile.name}</strong><small className="block truncate">{savedProfile.rank}{savedProfile.position ? ` · ${savedProfile.position}` : ''}</small></span>
                </div>
                <button type="button" onClick={() => { setUseSavedProfile(false); setPinVerified(false); setInputPin(''); setPinError(''); }} className="staff-login-text-link shrink-0">Ganti Profil</button>
              </div>
              {pinVerified ? (
                <p className="form-span-all rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-3 py-2 text-center text-xs font-semibold text-emerald-200" role="status">
                  Sesi PIN aktif. Klik tombol untuk melanjutkan.
                </p>
              ) : (
                <div className="staff-login-field staff-login-pin-field form-span-all">
                  <label className="block text-xs font-bold text-slate-300 mb-1">PIN Akses {inputRole === 'ADMIN' ? 'Admin Team RNT' : 'Staff'} *</label>
                  <input id="pin-akses" type="password" required maxLength={6} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" className="staff-login-pin-input w-full rounded-lg border bg-slate-50 text-sm font-mono tracking-widest" placeholder="Masukkan PIN Akses" value={inputPin} onChange={(event) => setInputPin(event.target.value.replace(/\D/g, '').slice(0, 6))} />
                </div>
              )}
              <button type="submit" disabled={isLoggingIn || rateLimitSeconds > 0} aria-busy={isLoggingIn} className="staff-login-submit form-span-all w-full rounded-lg bg-[#254532] py-3 text-sm font-bold text-white shadow-lg shadow-[#254532]/20 transition hover:bg-[#315a41] disabled:cursor-wait disabled:opacity-75">{isLoggingIn && <span className="staff-login-spinner" aria-hidden="true" />}{isLoggingIn ? 'Memverifikasi…' : rateLimitSeconds > 0 ? `Tunggu ${rateLimitSeconds} detik` : `Masuk Sesi ${inputRole}`}</button>
            </> : <>
            {savedProfile && <section className="staff-login-profile-picker staff-login-profiles form-span-all border p-3 text-left">
              <div className="mb-2 flex items-center justify-between"><strong className="text-xs">Pilih profil tersimpan</strong><button type="button" onClick={() => { setInputName(savedProfile.name || ''); setInputRank(savedProfile.rank || ''); setInputPosition(savedProfile.position || ''); setInputDepartment(savedProfile.department || ''); setInputRole(savedProfile.role || 'STAFF'); setInputPin(''); setPinVerified(false); setRememberProfile(true); setUseSavedProfile(Boolean(savedProfile.department)); }} className="staff-login-text-link">Batal</button></div>
              <button type="button" onClick={() => { setInputName(savedProfile.name || ''); setInputRank(savedProfile.rank || ''); setInputPosition(savedProfile.position || ''); setInputDepartment(savedProfile.department || ''); setInputRole(savedProfile.role || 'STAFF'); setInputPin(''); setPinVerified(false); setRememberProfile(true); setUseSavedProfile(Boolean(savedProfile.department)); }} className="staff-login-profile-option flex w-full items-center justify-between gap-3 border p-2.5 text-left">
                <span className="flex min-w-0 items-center gap-3"><span className="staff-login-avatar grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e7efe7] font-bold">{(savedProfile.name || 'R').slice(0, 1).toUpperCase()}</span><span className="min-w-0"><strong className="block truncate text-sm">{savedProfile.name}</strong><small className="block truncate">{savedProfile.rank}{savedProfile.position ? ` · ${savedProfile.position}` : ''} · {savedProfile.role === 'ADMIN' ? 'ADMIN' : 'STAFF'}{savedProfile.department ? ` · ${savedProfile.department}` : ''}</small></span></span><span className="shrink-0 text-xs font-bold">Pilih</span>
              </button>
              <button type="button" onClick={() => { setInputName(''); setInputRank(''); setInputPosition(''); setInputDepartment(''); setInputRole('STAFF'); setInputPin(''); setRememberProfile(false); setPinError(''); }} className="staff-login-profile-option mt-2 w-full border p-2.5 text-sm">Gunakan Identitas Lain</button>
            </section>}
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
                      onChange={() => setInputRole(role.id)}
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
                maxLength={80}
                autoComplete="name"
                className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg text-sm focus:outline-none focus:border-[#315842]"
                placeholder="Ketik nama personel"
                value={inputName}
                onChange={(event) => setInputName(event.target.value)}
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
                onChange={(event) => setInputRank(event.target.value)}
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
                onChange={(event) => setInputPosition(event.target.value)}
              />
              <datalist id="staff-position-options">
                <option value="Recruitment And Training Division" />
                <option value="Personnel Services Officer" />
              </datalist>
              <p className="staff-login-helper mt-1 text-left">Pilih saran atau ketik langsung pada kolom.</p>
            </div>

            <fieldset className="staff-login-departments form-span-all">
              <legend className="block text-xs font-bold text-slate-300 mb-2">Departemen *</legend>
              <p className="staff-login-department-hint">Pilih departemen yang akan dicantumkan pada tanda tangan balasan CV.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  { id: 'LSPD', name: 'Los Santos Police Department', logo: '/logos/lspd.png' },
                  { id: 'LSSD', name: 'Los Santos Sheriff Department', logo: '/logos/lssd.png' },
                  { id: 'SASP', name: 'San Andreas State Police', logo: '/logos/sasp.png' },
                ].map((department) => (
                  <label key={department.id} className={`staff-login-department ${inputDepartment === department.id ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="staff-department"
                      value={department.id}
                      aria-label={department.name}
                      required
                      checked={inputDepartment === department.id}
                      onChange={() => setInputDepartment(department.id)}
                    />
                    <span className="staff-department-logo"><Image src={department.logo} alt="" width={36} height={36} /></span>
                    <span className="staff-department-copy"><strong>{department.id}</strong></span>
                    <span className="staff-department-check" aria-hidden="true">✓</span>
                  </label>
                ))}
              </div>
            </fieldset>

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
                onChange={e => setInputPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>

            <label className="staff-login-remember form-span-all flex cursor-pointer items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={rememberProfile} onChange={(event) => setRememberProfile(event.target.checked)} className="h-4 w-4 accent-emerald-600" />
              <span>Ingat profil ini di perangkat saya</span>
            </label>
            <button type="submit" disabled={isLoggingIn || rateLimitSeconds > 0} aria-busy={isLoggingIn} className="staff-login-submit w-full bg-[#254532] text-white py-3 rounded-lg font-bold text-sm hover:bg-[#315a41] transition shadow-lg shadow-[#254532]/20 disabled:cursor-wait disabled:opacity-75">
              {isLoggingIn && <span className="staff-login-spinner" aria-hidden="true" />}{isLoggingIn ? 'Memverifikasi…' : rateLimitSeconds > 0 ? `Tunggu ${rateLimitSeconds} detik` : `Masuk Sesi ${inputRole}`}
            </button>
            </>}
          </form>

          <div className="staff-login-footer text-[10px] text-slate-500 pt-2 border-t border-slate-700/50">
            AKSES INTERNAL · RNT PROJECT PERSONNEL
          </div>
        </div>
      </div>
    );
  }

  if (/^\/internal\/[^/]+\/[^/]+$/.test(pathname) && !showBatchPicker && (batchLoading || !selectedBatch)) {
    return <div className="min-h-screen bg-[#f3f5f2] flex items-center justify-center"><p className="text-sm text-slate-500">Memulihkan halaman portal…</p></div>;
  }

  if (batchLoading || pathname === '/internal/select-batch' || !selectedBatch || showBatchPicker) {
    const now = serverClockNow ?? currentTime;
    return (
      <main className="batch-picker-page min-h-screen bg-[#f2f5f1] px-4 py-10 text-slate-800 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-[#1E3A2B]">RNT · RECRUITMENT PORTAL</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Pilih Batch Rekrutmen</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Pilih batch yang ingin Anda kelola. Dashboard dan data kandidat akan mengikuti pilihan ini.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {userRole === 'ADMIN' && <button type="button" onClick={() => openBatchEditor()} className="rounded-xl bg-[#1E3A2B] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#294d39]">＋ Tambah Batch Baru</button>}
              <div ref={userMenuRef} className="relative">
                <button type="button" aria-haspopup="menu" aria-expanded={userMenuOpen} onClick={() => setUserMenuOpen((open) => !open)} className="batch-picker-profile-trigger flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-[#1E3A2B] hover:shadow-md">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-[#e7efe7] font-bold text-[#1E3A2B]">{officerName.slice(0, 1).toUpperCase()}</span>
                  <span><strong className="block text-sm text-slate-800">{officerName}</strong><small className="text-xs text-slate-500">{userRole === 'ADMIN' ? 'Admin Team RNT' : 'Staff'}</small></span>
                  <svg className={`h-4 w-4 text-slate-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                {userMenuOpen && <div role="menu" className="batch-picker-profile-menu absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                  <div className="border-b border-slate-100 pb-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Sesi Aktif</p><strong className="mt-1 block text-base text-slate-900">{officerName}</strong><span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-[#1E3A2B]">{userRole === 'ADMIN' ? 'Admin Team RNT' : 'Staff'}</span></div>
                  <dl className="space-y-2 py-3 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">Pangkat</dt><dd className="text-right font-semibold text-slate-800">{officerRank || '—'}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Divisi / Jabatan</dt><dd className="text-right font-semibold text-slate-800">{officerPosition || '—'}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Departemen</dt><dd className="text-right font-semibold text-slate-800">{officerDepartment || '—'}</dd></div></dl>
                  <button type="button" role="menuitem" onClick={handleLogout} className="w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-left text-sm font-bold text-rose-700 transition hover:bg-rose-100">Keluar Sesi</button>
                </div>}
              </div>
            </div>
          </div>

          {batchError && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span>{batchError}</span><button type="button" onClick={reloadBatches} className="rounded-lg bg-white px-3 py-2 font-semibold text-rose-800 ring-1 ring-rose-200">Coba lagi</button></div>}

          {batchLoading ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm">Memuat daftar batch…</div> : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {batches.map((batch) => {
                const status = batchStatus(batch, now);
                const staffLocked = userRole !== 'ADMIN' && status.label === 'Terjadwal';
                return (
                  <article key={batch.id} className={`batch-picker-card group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition ${staffLocked ? 'opacity-90' : 'hover:-translate-y-0.5 hover:border-[#1E3A2B] hover:shadow-lg'}`}>
                    {staffLocked && <span className="batch-picker-lock-watermark pointer-events-none absolute inset-0 z-0 grid place-items-center text-[#1E3A2B]" title="Batch terjadwal hanya dapat dibuka Admin" aria-label="Batch terjadwal hanya dapat dibuka Admin"><svg className="h-1/2 w-1/2 max-h-56 max-w-56" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="15" r="1" fill="currentColor"/><path d="M12 16v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></span>}
                    <div className="relative z-10">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Batch Rekrutmen</p><h2 className="mt-1 text-xl font-bold text-[#1E3A2B]">{batch.name}</h2></div>
                      <span className={`relative z-10 shrink-0 rounded-full px-3 py-1 text-xs font-bold ring-1 ${status.className}`}>{status.label}</span>
                    </div>
                    <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Rentang Rekrutmen</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{formatRange(batch.registration_start, batch.academy_end)}</p>
                    <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-xs">
                      {[
                        ['Pendaftaran', batch.registration_start, batch.registration_end],
                        ['Review', batch.review_start, batch.review_end],
                        ['Interview', batch.interview_start, batch.interview_end],
                        ['Academy', batch.academy_start, batch.academy_end],
                      ].map(([label, start, end]) => <div key={label} className="flex justify-between gap-3"><span className="text-slate-500">{label}</span><span className="text-right font-medium text-slate-700">{formatRange(start, end)}</span></div>)}
                    </div>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                      <button type="button" disabled={staffLocked} onClick={() => chooseBatch(batch.id)} className="batch-picker-open-button group/open inline-flex items-center gap-2 rounded-lg bg-[#1E3A2B] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#294d39] hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"><span>{staffLocked ? 'Khusus Admin' : 'Buka batch ini'}</span>{!staffLocked && <svg className="h-4 w-4 transition-transform group-hover/open:translate-x-1" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3.5 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}</button>
                      {userRole === 'ADMIN' && <div className="flex gap-2"><button type="button" onClick={() => openBatchEditor(batch)} className="batch-picker-edit-button rounded-lg px-3 py-2 text-xs font-bold">Edit</button><button type="button" onClick={() => deleteBatch(batch)} className="batch-picker-delete-button rounded-lg px-3 py-2 text-xs font-bold">Hapus</button></div>}
                    </div>
                    </div>
                  </article>
                  );
              })}
            </div>
          )}

          {!batchLoading && batches.length === 0 && !batchError && <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm"><h2 className="text-lg font-bold text-slate-800">Belum ada batch rekrutmen</h2><p className="mt-2 text-sm text-slate-500">Admin Team RNT dapat membuat batch pertama langsung dari halaman ini.</p>{userRole === 'ADMIN' && <button type="button" onClick={() => openBatchEditor()} className="mt-5 rounded-lg bg-[#1E3A2B] px-5 py-3 text-sm font-bold text-white">＋ Tambah Batch Pertama</button>}</div>}
          {!batchLoading && <button type="button" onClick={reloadBatches} className="batch-picker-reload-button mt-6 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-[#1E3A2B] hover:text-[#1E3A2B]">Muat ulang daftar batch</button>}

        </div>
        {batchEditor && <div className="batch-picker-modal fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBatchEditor(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="batch-editor-title" className="batch-editor-dialog my-auto w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-[#1E3A2B]">Manajemen Batch · Admin</p><h2 id="batch-editor-title" className="mt-1 break-words text-xl font-bold text-slate-900">{batchEditor === 'edit' ? 'Edit Batch' : 'Tambah Batch Baru'}</h2></div><button type="button" onClick={() => setBatchEditor(null)} aria-label="Tutup modal" className="batch-editor-close grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg leading-none text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315842]">×</button></div>
            <form onSubmit={saveBatch} className="space-y-5">
              {batchFormError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{batchFormError}</p>}
              <label className="block text-sm font-semibold text-slate-700">Nama / nomor batch<input required minLength={2} maxLength={100} value={batchForm.name || ''} onChange={(event) => setBatchForm({ ...batchForm, name: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-[#1E3A2B]" placeholder="Contoh: Batch RNT 2026-2" /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ['Pendaftaran', 'registration'], ['Interview', 'interview'], ['Academy', 'academy'],
                ].map(([label, key]) => <fieldset key={key} className="min-w-0 rounded-xl border border-slate-200 p-4"><legend className="max-w-full whitespace-normal px-1 text-sm font-bold text-[#1E3A2B]">{label}</legend><div className="block min-w-0 text-xs font-medium text-slate-600"><span>Mulai</span><DateTimeField label={`${label} mulai`} value={batchForm[`${key}_start`] || ''} onChange={(value) => setBatchForm((current) => ({ ...current, [`${key}_start`]: value }))} /></div><div className="mt-3 block min-w-0 text-xs font-medium text-slate-600"><span>Selesai</span><DateTimeField label={`${label} selesai`} value={batchForm[`${key}_end`] || ''} onChange={(value) => setBatchForm((current) => ({ ...current, [`${key}_end`]: value }))} /></div></fieldset>)}
                <fieldset className="batch-review-summary min-w-0 rounded-xl border border-emerald-200 bg-emerald-50/70 p-5"><legend className="max-w-full whitespace-normal px-1 text-sm font-bold text-[#1E3A2B]">Review CV · otomatis</legend><p className="review-summary-description text-xs leading-5 text-slate-700">Akses Review berlangsung dari hari pertama Pendaftaran sampai hari terakhir Interview.</p><p className="mt-4 text-xs font-semibold text-slate-700">Mulai: {batchForm.registration_start ? formatDateTime(batchForm.registration_start) : 'mengikuti Pendaftaran'}</p><p className="mt-1 text-xs font-semibold text-slate-700">Selesai: {batchForm.interview_end ? formatDateTime(batchForm.interview_end) : 'mengikuti akhir Interview'}</p></fieldset>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4"><button type="button" onClick={() => setBatchEditor(null)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Batal</button><button disabled={batchSaving} type="submit" className="rounded-lg bg-[#1E3A2B] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{batchSaving ? 'Menyimpan…' : 'Simpan Batch'}</button></div>
            </form>
          </section>
        </div>}
      </main>
    );
  }

  return (
    <BatchContext.Provider value={{ selectedBatch }}>
    <div className="min-h-screen bg-slate-100 flex staff-workspace">
      <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between p-6 shrink-0 staff-sidebar">
        <div className="space-y-6">
          <Link href={selectedBatch ? `/internal/${slugForBatch(selectedBatch, batches)}/dashboard` : '/internal/select-batch'} className="flex items-center gap-3 staff-brand">
            <Image src="/logos/rnt-logo.svg" alt="Logo RNT" width={46} height={46} className="h-[46px] w-[46px] rounded-lg" />
            <span>RNT <small>PERSONNEL PORTAL</small></span>
            <span className="brand-pulse" aria-label="Sistem aktif" />
          </Link>

          <div className="nav-caption">WORKSPACE</div>
          <div className="rounded-xl border border-emerald-900 bg-[#1E3A2B] p-3 text-white">
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-200">Batch terpilih</p>
            <p className="mt-1 truncate text-sm font-bold" title={selectedBatch?.name}>{selectedBatch?.name || 'Belum dipilih'}</p>
            <button type="button" onClick={() => router.push('/internal/select-batch')} className="mt-2 w-full rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-emerald-50 transition hover:bg-white/10">{selectedBatch ? 'Ganti Batch' : 'Pilih Batch'}</button>
          </div>
          <nav className="space-y-1">
            <Link href={selectedBatch ? `/internal/${slugForBatch(selectedBatch, batches)}/dashboard` : '/internal/select-batch'} className={`staff-nav-link ${routeSection === 'dashboard' || pathname === '/internal/dashboard' ? 'active' : ''}`}><span>▦</span>Ringkasan</Link>
            <Link href={selectedBatch ? `/internal/${slugForBatch(selectedBatch, batches)}/review` : '/internal/select-batch'} className={`staff-nav-link ${routeSection === 'review' || pathname === '/internal/review' ? 'active' : ''}`}><span>⌕</span>Review CV</Link>
            <Link href={selectedBatch ? `/internal/${slugForBatch(selectedBatch, batches)}/interview` : '/internal/select-batch'} className={`staff-nav-link ${routeSection === 'interview' || pathname === '/internal/interview' ? 'active' : ''}`}><span>◷</span>Interview panel</Link>
            <Link href={selectedBatch ? `/internal/${slugForBatch(selectedBatch, batches)}/absensi` : '/internal/select-batch'} className={`staff-nav-link ${routeSection === 'absensi' || routeSection === 'academy' || pathname === '/internal/academy' ? 'active' : ''}`}><span>✓</span>Absensi Academy</Link>
            {userRole === 'ADMIN' && <>
              <Link href={selectedBatch ? `/internal/${slugForBatch(selectedBatch, batches)}/audit-log` : '/internal/select-batch'} className={`staff-nav-link ${routeSection === 'audit-log' || pathname === '/internal/audit-logs' ? 'active' : ''}`}><span>≡</span>Audit log<span className="nav-admin-tag">RNT</span></Link>
              <Link href={selectedBatch ? `/internal/${slugForBatch(selectedBatch, batches)}/management` : '/internal/select-batch'} className={`staff-nav-link ${routeSection === 'management' || pathname === '/internal/management' ? 'active' : ''}`}><span>⚙</span>Manajemen<span className="nav-admin-tag">RNT</span></Link>
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

      <main className="flex-1 staff-main">
        <header className="staff-topbar">
          <div><div className="staff-breadcrumb">RNT PROJECT <span>/</span> PERSONNEL</div><h1>{pageTitle}</h1><p>{pageSubtitle}</p></div>
          <div className="staff-top-actions inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200/60 bg-slate-100/80 p-1.5 dark:border-emerald-800/40 dark:bg-emerald-950/40"><div className="server-time-widget inline-flex min-w-0 items-center gap-2 px-2" aria-label="Waktu server sistem, zona waktu WIB" title="Waktu server sistem · Asia/Jakarta"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-emerald-300"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" /><path d="M12 7v5l3.2 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg><span className="font-mono text-[11px] font-medium tabular-nums text-slate-700 dark:text-emerald-300">{serverClockDisplay?.time || '--:--:--'}</span><span aria-hidden="true" className="text-[10px] text-slate-400 dark:text-emerald-800/80">·</span><span className="server-time-date whitespace-nowrap text-[9px] text-slate-500 dark:text-emerald-300/80">{serverClockDisplay?.date || 'Menyinkronkan…'}</span></div><span className="staff-live"><i /> SISTEM AKTIF</span>{selectedBatch && <button type="button" aria-label={`Ganti batch aktif, saat ini ${selectedBatch.name}`} onClick={() => setShowBatchPicker(true)} className="staff-batch-switcher inline-flex max-w-[220px] items-center gap-1.5 rounded-md border border-slate-200/60 bg-white/60 px-2.5 py-1 text-[10px] font-medium text-slate-700 hover:bg-white dark:border-emerald-800/40 dark:bg-emerald-950/20 dark:text-emerald-200 dark:hover:bg-emerald-900/40"><span className="text-slate-500 dark:text-emerald-300/70">Batch:</span><span className="truncate">{selectedBatch.name}</span><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-emerald-300/70"><path d="m5.5 7.5 4.5 4 4.5-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}<Link href={`/candidate?source=internal&returnTo=${encodeURIComponent(pathname)}`} className="staff-new-candidate rounded-md px-2.5 py-1.5 text-[10px]"><span>＋</span> Kandidat baru</Link></div>
        </header>
        <div className="staff-content">{children}</div>
      </main>
    </div>
    </BatchContext.Provider>
  );
}

export default function InternalLayout({ children }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f3f5f2]" aria-label="Memuat portal personel" />}>
      <InternalLayoutContent>{children}</InternalLayoutContent>
    </Suspense>
  );
}
