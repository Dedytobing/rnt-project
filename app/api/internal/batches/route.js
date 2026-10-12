import { NextResponse } from 'next/server';
import { getInternalSession } from '@/lib/internal-session';
import { createInternalDataClient } from '@/lib/supabase-server';
import { z } from 'zod';

const iso = z.string().datetime({ offset: true });
const batchFields = z.object({
  name: z.string().trim().min(2).max(100),
  registration_start: iso,
  registration_end: iso,
  interview_start: iso,
  interview_end: iso,
  academy_start: iso,
  academy_end: iso,
}).strict();

function rejectInvalidOrigin(request) {
  const origin = request.headers.get('origin');
  return origin && origin !== new URL(request.url).origin;
}

function adminSession(request) {
  const session = getInternalSession(request);
  if (!session) return { response: NextResponse.json({ success: false, error: 'Sesi personel diperlukan.' }, { status: 401 }) };
  if (session.role !== 'ADMIN') return { response: NextResponse.json({ success: false, error: 'Aksi ini hanya dapat dilakukan Admin RNT.' }, { status: 403 }) };
  return { session };
}

async function recordBatchActivity(db, session, event, batchName, actionDetails) {
  const { error } = await db.from('personnel_audit_logs').insert({
    personnel_id: session.personnelId,
    personnel_name: session.name,
    role: session.role,
    event,
    target_name: batchName,
    action_details: actionDetails,
  });
  if (error) console.error('Batch activity audit failed:', error);
}

async function readBatchInput(request) {
  try {
    const body = await request.json();
    const parsed = batchFields.safeParse(body);
    if (!parsed.success) return { response: NextResponse.json({ success: false, error: 'Nama batch atau jadwal tidak valid.' }, { status: 400 }) };
    const value = parsed.data;
    for (const stage of ['registration', 'interview', 'academy']) {
      if (Date.parse(value[`${stage}_start`]) >= Date.parse(value[`${stage}_end`])) {
        return { response: NextResponse.json({ success: false, error: `Jadwal ${stage} tidak valid.` }, { status: 400 }) };
      }
    }
    if (Date.parse(value.registration_start) >= Date.parse(value.interview_end)) {
      return { response: NextResponse.json({ success: false, error: 'Akhir Interview harus setelah awal Pendaftaran agar rentang Review valid.' }, { status: 400 }) };
    }
    return { value: { ...value, review_start: value.registration_start, review_end: value.interview_end } };
  } catch {
    return { response: NextResponse.json({ success: false, error: 'Format permintaan tidak valid.' }, { status: 400 }) };
  }
}

export async function GET(request) {
  const session = getInternalSession(request);
  if (!session) return NextResponse.json({ success: false, error: 'Sesi personel diperlukan.' }, { status: 401 });

  try {
    const db = createInternalDataClient(session);
    const { data, error } = await db.from('recruitment_batches')
      .select('id,name,is_active,registration_start,registration_end,review_start,review_end,interview_start,interview_end,academy_start,academy_end,created_at')
      .is('deleted_at', null);
    if (error) throw error;
    const now = Date.now();
    const timestamp = (value) => {
      const parsed = Date.parse(value || '');
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const priority = (batch) => {
      if (batch.is_active) return 0;
      return timestamp(batch.academy_end) < now ? 2 : 1;
    };
    const batches = [...(data || [])].sort((a, b) => {
      const groupDifference = priority(a) - priority(b);
      if (groupDifference) return groupDifference;

      if (priority(a) === 1) {
        return timestamp(a.registration_start) - timestamp(b.registration_start)
          || timestamp(b.created_at) - timestamp(a.created_at);
      }
      if (priority(a) === 2) {
        return timestamp(b.academy_end) - timestamp(a.academy_end)
          || timestamp(b.created_at) - timestamp(a.created_at);
      }
      return timestamp(b.created_at) - timestamp(a.created_at);
    });
    return NextResponse.json({ success: true, batches }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    console.error('Internal batch list query failed:', error);
    return NextResponse.json({ success: false, error: 'Daftar batch gagal dimuat.' }, { status: 503 });
  }
}

export async function POST(request) {
  if (rejectInvalidOrigin(request)) return NextResponse.json({ success: false, error: 'Asal permintaan tidak valid.' }, { status: 403 });
  const { session, response } = adminSession(request);
  if (response) return response;
  const { value, response: inputError } = await readBatchInput(request);
  if (inputError) return inputError;
  try {
    const db = createInternalDataClient(session);
    const { data, error } = await db.from('recruitment_batches')
      .insert({ ...value, is_active: false }).select().single();
    if (error) throw error;
    await recordBatchActivity(db, session, 'BATCH_CREATED', data.name, `Membuat batch rekrutmen ${data.name} beserta jadwal tahapannya.`);
    return NextResponse.json({ success: true, batch: data });
  } catch (error) {
    console.error('Internal batch create failed:', error);
    return NextResponse.json({ success: false, error: 'Batch gagal dibuat. Periksa apakah nama batch sudah digunakan.' }, { status: 409 });
  }
}

export async function PATCH(request) {
  if (rejectInvalidOrigin(request)) return NextResponse.json({ success: false, error: 'Asal permintaan tidak valid.' }, { status: 403 });
  const { session, response } = adminSession(request);
  if (response) return response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: 'Format permintaan tidak valid.' }, { status: 400 }); }
  const id = z.uuid().safeParse(body?.id);
  if (!id.success) return NextResponse.json({ success: false, error: 'Batch tidak valid.' }, { status: 400 });
  const { value, response: inputError } = await readBatchInput({ json: async () => { const { id: ignored, ...fields } = body; return fields; } });
  if (inputError) return inputError;
  try {
    const db = createInternalDataClient(session);
    const { data: previous, error: lookupError } = await db.from('recruitment_batches').select('name').eq('id', id.data).is('deleted_at', null).maybeSingle();
    if (lookupError) throw lookupError;
    const { data, error } = await db.from('recruitment_batches')
      .update(value).eq('id', id.data).is('deleted_at', null).select().maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, error: 'Batch tidak ditemukan.' }, { status: 404 });
    await recordBatchActivity(db, session, 'BATCH_UPDATED', data.name, `Memperbarui nama atau jadwal batch ${data.name}${previous?.name && previous.name !== data.name ? ` (sebelumnya ${previous.name})` : ''}.`);
    return NextResponse.json({ success: true, batch: data });
  } catch (error) {
    console.error('Internal batch update failed:', error);
    return NextResponse.json({ success: false, error: 'Batch gagal diperbarui. Periksa apakah nama batch sudah digunakan.' }, { status: 409 });
  }
}

export async function DELETE(request) {
  if (rejectInvalidOrigin(request)) return NextResponse.json({ success: false, error: 'Asal permintaan tidak valid.' }, { status: 403 });
  const { session, response } = adminSession(request);
  if (response) return response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: 'Format permintaan tidak valid.' }, { status: 400 }); }
  const id = z.uuid().safeParse(body?.id);
  if (!id.success) return NextResponse.json({ success: false, error: 'Batch tidak valid.' }, { status: 400 });
  try {
    const db = createInternalDataClient(session);
    const { data: previous, error: lookupError } = await db.from('recruitment_batches').select('name').eq('id', id.data).is('deleted_at', null).maybeSingle();
    if (lookupError) throw lookupError;
    const { data, error } = await db.from('recruitment_batches')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', id.data).is('deleted_at', null).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, error: 'Batch tidak ditemukan.' }, { status: 404 });
    if (previous) await recordBatchActivity(db, session, 'BATCH_DELETED', previous.name, `Menghapus batch rekrutmen ${previous.name}.`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Internal batch delete failed:', error);
    return NextResponse.json({ success: false, error: 'Batch gagal dihapus.' }, { status: 500 });
  }
}
