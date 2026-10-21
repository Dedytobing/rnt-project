export const STAGE_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

export function stageEndWithGrace(value, gracePeriodMs = STAGE_GRACE_PERIOD_MS) {
  const end = Date.parse(value || '');
  return Number.isFinite(end) ? end + gracePeriodMs : Number.NaN;
}

export function isStageWindowOpen(startValue, endValue, now = Date.now(), gracePeriodMs = STAGE_GRACE_PERIOD_MS) {
  const start = Date.parse(startValue || '');
  const endWithGrace = stageEndWithGrace(endValue, gracePeriodMs);
  const time = now instanceof Date ? now.getTime() : Number(now);
  return Number.isFinite(start) && Number.isFinite(endWithGrace) && time >= start && time <= endWithGrace;
}

export async function checkCandidateStageWindow(client, candidateId, stage, now = new Date()) {
  const { data: candidate, error: candidateError } = await client.from('candidates').select('batch_id').eq('id', candidateId).is('deleted_at', null).maybeSingle();
  if (candidateError) return { allowed: false, status: 503, message: 'Jadwal batch belum dapat diverifikasi.' };
  if (!candidate) return { allowed: false, status: 404, message: 'Kandidat tidak ditemukan atau sudah dihapus.' };
  if (!candidate.batch_id) return { allowed: false, status: 409, message: 'Kandidat belum terhubung ke batch.' };
  const { data: batch, error } = await client.from('recruitment_batches').select(`${stage}_start,${stage}_end`).eq('id', candidate.batch_id).is('deleted_at', null).maybeSingle();
  if (error || !batch) return { allowed: false, status: 503, message: 'Jadwal batch belum dapat diverifikasi.' };
  const allowed = isStageWindowOpen(batch[`${stage}_start`], batch[`${stage}_end`], now);
  return { allowed, status: allowed ? 200 : 403, message: allowed ? '' : `Tahap ${stage} belum dibuka atau sudah ditutup sesuai jadwal batch.` };
}
