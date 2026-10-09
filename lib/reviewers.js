export function appendReviewerName(existingNames, nextName) {
  const names = String(existingNames || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const next = String(nextName || '').trim();

  if (next && !names.some((name) => name.toLocaleLowerCase() === next.toLocaleLowerCase())) {
    names.push(next);
  }

  return names.join(', ');
}
