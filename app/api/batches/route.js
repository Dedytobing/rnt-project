import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const db = createServiceRoleClient();
    const { data, error } = await db.from('recruitment_batches')
      .select('id,name,registration_start,registration_end')
      .eq('is_active', true).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    const open = data && Date.now() >= Date.parse(data.registration_start) && Date.now() <= Date.parse(data.registration_end);
    return NextResponse.json({ success: true, batch: open ? data : null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Active batch query failed:', error);
    return NextResponse.json({ success: false, error: 'Informasi batch belum tersedia.' }, { status: 503 });
  }
}
