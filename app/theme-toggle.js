'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'rnt-theme';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.dataset.theme === 'dark');
  }, []);

  function toggleTheme() {
    const nextIsDark = !isDark;
    document.documentElement.dataset.theme = nextIsDark ? 'dark' : 'light';
    try {
      window.localStorage.setItem(STORAGE_KEY, nextIsDark ? 'dark' : 'light');
    } catch {
      // Theme still works for this page when browser storage is unavailable.
    }
    setIsDark(nextIsDark);
  }

  return (
    <button
      type="button"
      className="rnt-theme-toggle"
      onClick={toggleTheme}
      aria-label={isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
      aria-pressed={isDark}
      title={isDark ? 'Mode gelap aktif' : 'Mode terang aktif'}
    >
      <span className="theme-toggle-thumb" aria-hidden="true" />
      <svg className="theme-toggle-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>
      <svg className="theme-toggle-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/></svg>
    </button>
  );
}
