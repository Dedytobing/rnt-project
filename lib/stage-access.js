export async function checkCandidateStageWindow(client, candidateId, stage, now = new Date()) {
  const { data: candidate, error: candidateError } = await client.from('candidates').select('batch_id').eq('id', candidateId).is('deleted_at', null).maybeSingle();
  if (candidateError) return { allowed: false, status: 503, message: 'Jadwal batch belum dapat diverifikasi.' };
  if (!candidate) return { allowed: false, status: 404, message: 'Kandidat tidak ditemukan atau sudah dihapus.' };
  if (!candidate.batch_id) return { allowed: false, status: 409, message: 'Kandidat belum terhubung ke batch.' };
  const { data: batch, error } = await client.from('recruitment_batches').select(`${stage}_start,${stage}_end`).eq('id', candidate.batch_id).is('deleted_at', null).maybeSingle();
  if (error || !batch) return { allowed: false, status: 503, message: 'Jadwal batch belum dapat diverifikasi.' };
  const time = now.getTime();
  const allowed = time >= Date.parse(batch[`${stage}_start`]) && time <= Date.parse(batch[`${stage}_end`]);
  return { allowed, status: allowed ? 200 : 403, message: allowed ? '' : `Tahap ${stage} belum dibuka atau sudah ditutup sesuai jadwal batch.` };
}
