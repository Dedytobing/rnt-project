const entries = new Map();

export function readClientData(key, maxAgeMs = 45_000) {
  const entry = entries.get(key);
  if (!entry || Date.now() - entry.savedAt > maxAgeMs) return null;
  return entry.value;
}

export function writeClientData(key, value) {
  entries.set(key, { value, savedAt: Date.now() });
  return value;
}

export function clearClientData(key) {
  if (key) entries.delete(key);
  else entries.clear();
}
