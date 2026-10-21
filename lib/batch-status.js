export function getBatchStatus(batch, now = Date.now()) {
  const time = now instanceof Date ? now.getTime() : Number(now);
  const start = Date.parse(batch?.registration_start || '');
  const academyEnd = Date.parse(batch?.academy_end || '');

  if (Number.isFinite(start) && time < start) return 'scheduled';
  if (Number.isFinite(academyEnd) && time > academyEnd) return 'completed';
  return 'active';
}
