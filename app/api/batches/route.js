import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const db = createServiceRoleClient();
    const now = new Date().toISOString();
    const { data, error } = await db.from('recruitment_batches')
      .select('id,name,registration_start,registration_end')
      .lte('registration_start', now)
      .gte('registration_end', now)
      .is('deleted_at', null)
      .order('registration_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ success: true, batch: data || null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Active batch query failed:', error);
    return NextResponse.json({ success: false, error: 'Informasi batch belum tersedia.' }, { status: 503 });
  }
}
