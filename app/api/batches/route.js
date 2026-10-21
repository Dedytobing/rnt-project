import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-server';
import { getInternalSession } from '@/lib/internal-session';
import { isStageWindowOpen, STAGE_GRACE_PERIOD_MS } from '@/lib/stage-access';

export async function GET(request) {
  try {
    const internalSession = getInternalSession(request);
    const gracePeriodMs = internalSession ? STAGE_GRACE_PERIOD_MS : 0;
    const db = createServiceRoleClient();
    const now = Date.now();
    const { data, error } = await db.from('recruitment_batches')
      .select('id,name,registration_start,registration_end')
      .lte('registration_start', new Date(now).toISOString())
      .gte('registration_end', new Date(now - gracePeriodMs).toISOString())
      .is('deleted_at', null)
      .order('registration_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const batch = data && isStageWindowOpen(data.registration_start, data.registration_end, now, gracePeriodMs) ? data : null;
    const registrationEnd = Date.parse(data?.registration_end || '');
    const staffGraceActive = Boolean(internalSession && Number.isFinite(registrationEnd)
      && now > registrationEnd && now <= registrationEnd + STAGE_GRACE_PERIOD_MS);
    return NextResponse.json({ success: true, batch, staffGraceActive }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Active batch query failed:', error);
    return NextResponse.json({ success: false, error: 'Informasi batch belum tersedia.' }, { status: 503 });
  }
}
