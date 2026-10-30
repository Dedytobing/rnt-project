export function splitStaffNameEntries(value) {
  const source = Array.isArray(value) ? value.filter((name) => typeof name === 'string').join(', ') : String(value || '');
  return source.split(/\s*[,;|]\s*/).map((name) => name.trim()).filter(Boolean);
}

export function displayStaffFirstNames(value) {
  return splitStaffNameEntries(value)
    .map((name) => name.split(/\s+/)[0])
    .filter(Boolean)
    .map((name) => `${name.charAt(0).toLocaleUpperCase('id-ID')}${name.slice(1).toLocaleLowerCase('id-ID')}`)
    .join(', ') || '—';
}
