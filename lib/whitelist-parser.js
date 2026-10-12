const rosterTitles = [
  'Assistant Sheriff',
  'Deputy Sheriff',
  'Division Chief',
  'Assistant Chief',
  'Undersheriff',
  'Deputy Chief',
  'Sheriff',
  'Chief of Police',
  'Commander',
  'Captain',
  'Lieutenant',
  'Sergeant II',
  'Sergeant I',
  'Deputy',
  'Police Officer III',
  'Police Officer II',
];

// Buat regex dinamis untuk mendeteksi pangkat
const titlePattern = new RegExp(`\\b(?:${rosterTitles.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');

export function cleanWhitelistRosterLine(value) {
  let name = String(value || '').trim();
  if (!name) return '';

  // 1. Hapus keterangan di dalam tanda kurung di akhir baris (misal: (Patrol Operations))
  name = name.replace(/\s*\([^()]*\)\s*$/, '').trim();

  // 2. Hapus semua sebutan pangkat/jabatan yang ada di dalam baris (tidak peduli posisinya di depan atau tengah)
  name = name.replace(titlePattern, '').trim();

  // 3. Hapus nomor tag ID (dengan atau tanpa tanda #) beserta simbol pemisahnya (-, :, dll) di mana pun posisinya
  // Contoh: menangkap "#71101 - " atau "#71101:"
  name = name.replace(/#?\d+\s*[-–—:.)]\s*/g, '').trim();
  
  // 4. Cadangan: Hapus sisa angka ID murni jika ada di awal string tanpa tanda hubung
  name = name.replace(/^\s*#?\d+\s+/, '').trim();

  // 5. Bersihkan sisa simbol atau karakter pemisah di awal/akhir string
  name = name.replace(/^[|•·\s-]+|[|•·\s-]+$/g, '').trim();

  return name;
}

export function parseWhitelistRoster(text) {
  const lines = String(text || '').split(/\r?\n/).map((source, index) => ({ source: source.trim(), line: index + 1 })).filter((item) => item.source);
  const vacantCount = lines.filter(({ source }) => /\bVACANT\b/i.test(source)).length;
  const entries = new Map();

  for (const item of lines) {
    if (/\bVACANT\b/i.test(item.source)) continue;
    const fullName = cleanWhitelistRosterLine(item.source);
    if (fullName.length < 2 || fullName.length > 80) continue;
    const normalizedName = fullName.toLocaleLowerCase('id-ID');
    if (!entries.has(normalizedName)) entries.set(normalizedName, { ...item, fullName, normalizedName });
  }

  return {
    rows: [...entries.values()],
    vacantCount,
    skippedCount: lines.length - entries.size,
  };
}