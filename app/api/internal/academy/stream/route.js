import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getInternalSession } from '@/lib/internal-session';
import { createInternalDataClient } from '@/lib/supabase-server';
import { isStageWindowOpen } from '@/lib/stage-access';

export async function GET(request) {
  const session = getInternalSession(request);
  if (!session) return NextResponse.json({ success: false, error: 'Sesi personel diperlukan.' }, { status: 401 });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ success: false, error: 'Asal permintaan tidak valid.' }, { status: 403 });
  const batchId = z.uuid().safeParse(new URL(request.url).searchParams.get('batch_id'));
  if (!batchId.success) return NextResponse.json({ success: false, error: 'Batch tidak valid.' }, { status: 400 });

  const db = createInternalDataClient(session);
  const { data: batch, error } = await db.from('recruitment_batches')
    .select('id,academy_start,academy_end').eq('id', batchId.data).is('deleted_at', null).maybeSingle();
  if (error) return NextResponse.json({ success: false, error: 'Batch gagal diverifikasi.' }, { status: 503 });
  if (!batch) return NextResponse.json({ success: false, error: 'Batch tidak ditemukan.' }, { status: 404 });
  const now = Date.now();
  if (session.role === 'STAFF' && !isStageWindowOpen(batch.academy_start, batch.academy_end, now)) {
    return NextResponse.json({ success: false, error: 'Akses Academy hanya tersedia selama jadwal batch berlangsung.' }, { status: 403 });
  }

  const encoder = new TextEncoder();
  let channel;
  let heartbeat;
  let closed = false;
  let controllerRef;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    request.signal.removeEventListener('abort', cleanup);
    if (channel) db.removeChannel(channel).catch(() => {});
    try { controllerRef?.close(); } catch {}
  };
  const stream = new ReadableStream({
    start(controller) {
      controllerRef = controller;
      const send = (event, value = {}) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`)); }
        catch { cleanup(); }
      };
      channel = db.channel(`academy-attendance-${batch.id}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'academy_attendance', filter: `batch_id=eq.${batch.id}`,
        }, () => send('attendance_changed'))
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'candidates', filter: `batch_id=eq.${batch.id}`,
        }, () => send('attendance_changed'))
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'academy_pic_groups', filter: `batch_id=eq.${batch.id}`,
        }, () => send('attendance_changed'))
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'academy_pic_group_members', filter: `batch_id=eq.${batch.id}`,
        }, () => send('attendance_changed'))
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'academy_candidate_pic_groups', filter: `batch_id=eq.${batch.id}`,
        }, () => send('attendance_changed'))
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') send('ready', { batchId: batch.id });
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') send('realtime_unavailable');
        });
      heartbeat = setInterval(() => send('keepalive'), 20000);
      request.signal.addEventListener('abort', cleanup, { once: true });
    },
    cancel: cleanup,
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
