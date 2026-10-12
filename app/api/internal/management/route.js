import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getInternalSession } from '@/lib/internal-session';
import { createInternalDataClient } from '@/lib/supabase-server';
import { cleanWhitelistRosterLine } from '@/lib/whitelist-parser';

const candidateAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('SOFT_DELETE'), candidateId: z.string().min(1).max(100), batchId: z.uuid() }).strict(),
  z.object({ action: z.literal('RESTORE'), candidateId: z.string().min(1).max(100), batchId: z.uuid() }).strict(),
]);
const departmentAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('SET_CANDIDATE_DEPARTMENT'), candidateId: z.string().min(1).max(100), batchId: z.uuid(), department: z.enum(['', 'LSPD', 'LSSD', 'DOC']) }).strict(),
  z.object({ action: z.literal('SET_CANDIDATE_DEPARTMENTS_BULK'), candidateIds: z.array(z.string().min(1).max(100)).min(1).max(500), batchId: z.uuid(), department: z.enum(['', 'LSPD', 'LSSD', 'DOC']) }).strict(),
]);
const personnelAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('SAVE_PERSONNEL'), personnelId: z.uuid(), fullName: z.string().trim().min(2).max(80), role: z.enum(['STAFF', 'ADMIN']), rank: z.string().trim().min(2).max(60), position: z.string().trim().max(100), department: z.enum(['LSPD', 'LSSD']) }).strict(),
  z.object({ action: z.literal('DELETE_PERSONNEL'), personnelId: z.uuid() }).strict(),
  z.object({ action: z.literal('ADD_WHITELIST'), fullName: z.string().trim().min(2).max(80), role: z.enum(['STAFF', 'ADMIN']) }).strict(),
  z.object({ action: z.literal('BULK_WHITELIST'), entries: z.array(z.object({ fullName: z.string().trim().min(2).max(120), role: z.enum(['STAFF', 'ADMIN']) }).strict()).min(1).max(1000) }).strict(),
  z.object({ action: z.literal('UPDATE_WHITELIST_ROLE'), whitelistId: z.uuid(), role: z.enum(['STAFF', 'ADMIN']) }).strict(),
  z.object({ action: z.literal('DELETE_WHITELIST'), whitelistId: z.uuid() }).strict(),
]);

async function recordPersonnelActivity(db, session, event, targetName, actionDetails) {
  const { error } = await db.from('personnel_audit_logs').insert({
    personnel_id: session.personnelId,
    personnel_name: session.name,
    role: session.role,
    event,
    target_name: targetName || null,
    action_details: actionDetails,
  });
  if (error) console.error('Personnel activity audit failed:', error);
}

export async function GET(request) {
  const session = getInternalSession(request);
  if (!session) return NextResponse.json({ success: false, error: 'Sesi personel diperlukan.' }, { status: 401 });
  if (session.role !== 'ADMIN') return NextResponse.json({ success: false, error: 'Akses Admin RNT diperlukan.' }, { status: 403 });
  try {
    const db = createInternalDataClient(session);
    const batchId = z.uuid().safeParse(new URL(request.url).searchParams.get('batch_id'));
    if (!batchId.success) return NextResponse.json({ success: false, error: 'Pilih batch untuk memuat data manajemen.' }, { status: 400 });
    const { data: batch, error: batchError } = await db.from('recruitment_batches')
      .select('id,name,is_active,registration_start,registration_end,review_start,review_end,interview_start,interview_end,academy_start,academy_end')
      .eq('id', batchId.data).is('deleted_at', null).maybeSingle();
    if (batchError) throw batchError;
    if (!batch) return NextResponse.json({ success: false, error: 'Batch tidak ditemukan atau sudah dihapus.' }, { status: 404 });
    const [personnel, whitelist, candidates] = await Promise.all([
      db.from('rnt_personnel').select('id,full_name,normalized_name,role,rank,position,department,is_active').order('full_name'),
      db.from('rnt_personnel_name_whitelist').select('id,full_name,normalized_name,role,is_active,created_at').order('full_name'),
      db.from('candidates').select('id,nama,link_cv,batch_id,deleted_at,deleted_by,status_cv,status_interview,mdt_check,catatan,notes_investigator,notes_interviewer,created_at,mapping_dept,dept_preference').eq('batch_id', batchId.data).order('created_at', { ascending: false }),
    ]);
    const failed = [personnel, whitelist, candidates].find((result) => result.error);
    if (failed) throw failed.error;
    return NextResponse.json({
      success: true,
      batch,
      personnel: personnel.data || [],
      whitelist: whitelist.data || [],
      candidates: candidates.data || [],
      groups: [],
      groupMembers: [],
      candidateGroups: [],
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Internal management data query failed:', error);
    return NextResponse.json({ success: false, error: 'Data manajemen belum dapat dimuat. Pastikan migrasi database sudah diterapkan.' }, { status: 503 });
  }
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ success: false, error: 'Asal permintaan tidak valid.' }, { status: 403 });
  const session = getInternalSession(request);
  if (!session) return NextResponse.json({ success: false, error: 'Sesi personel diperlukan.' }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: 'Format permintaan tidak valid.' }, { status: 400 }); }
  if (session.role !== 'ADMIN') return NextResponse.json({ success: false, error: 'Aksi ini hanya dapat dilakukan Admin RNT.' }, { status: 403 });
  const parsed = [candidateAction, departmentAction, personnelAction].map((schema) => schema.safeParse(body)).find((result) => result.success);
  if (!parsed) return NextResponse.json({ success: false, error: 'Format atau nilai permintaan tidak valid.' }, { status: 400 });
  const action = parsed.data;
  const db = createInternalDataClient(session);
  try {
    if (action.action === 'ADD_WHITELIST') {
      const fullName = cleanWhitelistRosterLine(action.fullName);
      if (fullName.length < 2 || fullName.length > 80 || /\bVACANT\b/i.test(action.fullName)) return NextResponse.json({ success: false, error: 'Masukkan nama valid tanpa baris VACANT.' }, { status: 400 });
      const normalizedName = fullName.toLocaleLowerCase('id-ID');
      const { data: previousAccess, error: lookupError } = await db.from('rnt_personnel_name_whitelist').select('role,is_active').eq('normalized_name', normalizedName).maybeSingle();
      if (lookupError) throw lookupError;
      const { error } = await db.from('rnt_personnel_name_whitelist').upsert({ full_name: fullName, normalized_name: normalizedName, role: action.role, is_active: true }, { onConflict: 'normalized_name' });
      if (error) throw error;
      const event = previousAccess ? 'ACCESS_UPDATED' : 'ACCESS_ADDED';
      const details = previousAccess
        ? `Memperbarui akses ${action.role === 'ADMIN' ? 'Admin' : 'Staff'} untuk ${fullName}${previousAccess.role !== action.role ? ` dari ${previousAccess.role === 'ADMIN' ? 'Admin' : 'Staff'}` : ''}.`
        : `Menambahkan akses ${action.role === 'ADMIN' ? 'Admin' : 'Staff'} untuk ${fullName}.`;
      await recordPersonnelActivity(db, session, event, fullName, details);
      return NextResponse.json({ success: true, savedCount: 1 });
    }
    if (action.action === 'BULK_WHITELIST') {
      const normalizedEntries = new Map();
      for (const entry of action.entries) {
        if (/\bVACANT\b/i.test(entry.fullName)) continue;
        const fullName = cleanWhitelistRosterLine(entry.fullName);
        if (fullName.length < 2 || fullName.length > 80) continue;
        normalizedEntries.set(fullName.toLocaleLowerCase('id-ID'), { full_name: fullName, normalized_name: fullName.toLocaleLowerCase('id-ID'), role: entry.role, is_active: true });
      }
      const rows = [...normalizedEntries.values()];
      if (!rows.length) return NextResponse.json({ success: false, error: 'Tidak ada nama valid untuk disimpan.' }, { status: 400 });
      const { data: previousRows, error: lookupError } = await db.from('rnt_personnel_name_whitelist').select('full_name,normalized_name,role,is_active').in('normalized_name', rows.map((row) => row.normalized_name));
      if (lookupError) throw lookupError;
      const { error } = await db.from('rnt_personnel_name_whitelist').upsert(rows, { onConflict: 'normalized_name' });
      if (error) throw error;
      const previousByName = new Map((previousRows || []).map((row) => [row.normalized_name, row]));
      const addedCount = rows.filter((row) => !previousByName.has(row.normalized_name)).length;
      const updatedCount = rows.length - addedCount;
      const roleCounts = rows.reduce((counts, row) => ({ ...counts, [row.role]: (counts[row.role] || 0) + 1 }), {});
      const summary = [`${rows.length} nama`, `${addedCount} akses baru`, `${updatedCount} akses diperbarui`, `${roleCounts.STAFF || 0} Staff`, `${roleCounts.ADMIN || 0} Admin`].join('; ');
      await recordPersonnelActivity(db, session, 'BULK_ACCESS_UPDATED', null, `Memproses daftar akses personel sekaligus (${summary}).`);
      return NextResponse.json({ success: true, savedCount: rows.length });
    }
    if (action.action === 'UPDATE_WHITELIST_ROLE') {
      const { data: previous, error: lookupError } = await db.from('rnt_personnel_name_whitelist').select('full_name,role').eq('id', action.whitelistId).maybeSingle();
      if (lookupError) throw lookupError;
      const { data, error } = await db.from('rnt_personnel_name_whitelist').update({ role: action.role, is_active: true }).eq('id', action.whitelistId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ success: false, error: 'Nama whitelist tidak ditemukan.' }, { status: 404 });
      if (previous) await recordPersonnelActivity(db, session, 'ACCESS_ROLE_CHANGED', previous.full_name, `Mengubah peran akses ${previous.full_name} dari ${previous.role === 'ADMIN' ? 'Admin' : 'Staff'} menjadi ${action.role === 'ADMIN' ? 'Admin' : 'Staff'}.`);
      return NextResponse.json({ success: true });
    }
    if (action.action === 'DELETE_WHITELIST') {
      const { data: previous, error: lookupError } = await db.from('rnt_personnel_name_whitelist').select('full_name').eq('id', action.whitelistId).maybeSingle();
      if (lookupError) throw lookupError;
      const { data, error } = await db.from('rnt_personnel_name_whitelist').update({ is_active: false }).eq('id', action.whitelistId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ success: false, error: 'Nama whitelist tidak ditemukan.' }, { status: 404 });
      if (previous) await recordPersonnelActivity(db, session, 'ACCESS_REMOVED', previous.full_name, `Mencabut akses portal untuk ${previous.full_name}.`);
      return NextResponse.json({ success: true });
    }
    if (action.action === 'SAVE_PERSONNEL') {
      const normalizedName = action.fullName.toLocaleLowerCase('id-ID').trim();
      const previousQuery = action.personnelId
        ? db.from('rnt_personnel').select('id,full_name,normalized_name,role,rank,department').eq('id', action.personnelId).maybeSingle()
        : db.from('rnt_personnel').select('id,full_name,normalized_name,role,rank,department').eq('normalized_name', normalizedName).maybeSingle();
      const { data: previousPerson, error: previousPersonError } = await previousQuery;
      if (previousPersonError) throw previousPersonError;
      if (action.personnelId) {
        if (previousPerson && previousPerson.normalized_name !== normalizedName) {
          const { error: deactivateOldNameError } = await db.from('rnt_personnel_name_whitelist').update({ is_active: false }).eq('normalized_name', previousPerson.normalized_name);
          if (deactivateOldNameError) throw deactivateOldNameError;
        }
      }
      const { error: whitelistError } = await db.from('rnt_personnel_name_whitelist').upsert({
        full_name: action.fullName, normalized_name: normalizedName, role: action.role, is_active: true,
      }, { onConflict: 'normalized_name' });
      if (whitelistError) throw whitelistError;
      const values = { full_name: action.fullName, normalized_name: normalizedName, role: action.role, rank: action.rank, position: action.position, department: action.department, is_active: true };
      let personnelQuery = action.personnelId
        ? db.from('rnt_personnel').update(values).eq('id', action.personnelId)
        : db.from('rnt_personnel').upsert(values, { onConflict: 'normalized_name' });
      const { data: personnel, error: personnelError } = await personnelQuery.select('id').single();
      if (personnelError) throw personnelError;
      const details = previousPerson
        ? `Memperbarui profil ${action.fullName}: akses ${action.role === 'ADMIN' ? 'Admin' : 'Staff'}, pangkat ${action.rank}, departemen ${action.department}.`
        : `Menambahkan personel ${action.fullName} dengan akses ${action.role === 'ADMIN' ? 'Admin' : 'Staff'} di departemen ${action.department}.`;
      await recordPersonnelActivity(db, session, previousPerson ? 'PERSONNEL_UPDATED' : 'PERSONNEL_ADDED', action.fullName, details);
      return NextResponse.json({ success: true, personnelId: personnel.id });
    }
    if (action.action === 'DELETE_PERSONNEL') {
      const { data: person, error: lookupError } = await db.from('rnt_personnel').select('id,full_name,normalized_name').eq('id', action.personnelId).maybeSingle();
      if (lookupError) throw lookupError;
      if (!person) return NextResponse.json({ success: false, error: 'Personel tidak ditemukan.' }, { status: 404 });
      const { error } = await db.from('rnt_personnel').update({ is_active: false }).eq('id', person.id);
      if (error) throw error;
      const { error: whitelistError } = await db.from('rnt_personnel_name_whitelist').update({ is_active: false }).eq('normalized_name', person.normalized_name);
      if (whitelistError) throw whitelistError;
      await recordPersonnelActivity(db, session, 'PERSONNEL_DEACTIVATED', person.full_name, `Menonaktifkan akses personel ${person.full_name}.`);
      return NextResponse.json({ success: true });
    }
    if (action.action === 'SOFT_DELETE' || action.action === 'RESTORE') {
      const deleted = action.action === 'SOFT_DELETE';
      let query = db.from('candidates').update({
        deleted_at: deleted ? new Date().toISOString() : null,
        deleted_by: deleted ? session.name : null,
        updated_at: new Date().toISOString(),
      }).eq('id', action.candidateId).eq('batch_id', action.batchId);
      query = deleted ? query.is('deleted_at', null) : query.not('deleted_at', 'is', null);
      const { data, error } = await query.select('id').maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ success: false, error: 'Kandidat tidak ditemukan dalam batch terpilih.' }, { status: 404 });
      return NextResponse.json({ success: true });
    }

    if (action.action === 'SET_CANDIDATE_DEPARTMENT') {
      const { data, error } = await db.from('candidates').update({ mapping_dept: action.department || null, updated_at: new Date().toISOString() })
        .eq('id', action.candidateId).eq('batch_id', action.batchId).is('deleted_at', null).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ success: false, error: 'Kandidat tidak ditemukan pada batch ini.' }, { status: 404 });
      return NextResponse.json({ success: true, updatedCount: 1 });
    }
    if (action.action === 'SET_CANDIDATE_DEPARTMENTS_BULK') {
      const candidateIds = [...new Set(action.candidateIds)];
      const { data: existingCandidates, error: lookupError } = await db.from('candidates').select('id')
        .eq('batch_id', action.batchId).is('deleted_at', null).in('id', candidateIds);
      if (lookupError) throw lookupError;
      if ((existingCandidates || []).length !== candidateIds.length) return NextResponse.json({ success: false, error: 'Sebagian kandidat tidak ditemukan pada batch ini. Tidak ada perubahan yang diterapkan.' }, { status: 404 });
      const { data, error } = await db.from('candidates').update({ mapping_dept: action.department || null, updated_at: new Date().toISOString() })
        .eq('batch_id', action.batchId).is('deleted_at', null).in('id', candidateIds).select('id');
      if (error) throw error;
      if ((data || []).length !== candidateIds.length) throw new Error('Bulk department update returned an unexpected row count.');
      return NextResponse.json({ success: true, updatedCount: data.length });
    }

  } catch (error) {
    console.error('Internal management action failed:', error);
    return NextResponse.json({ success: false, error: 'Perubahan belum dapat disimpan. Pastikan migrasi database sudah diterapkan.' }, { status: 500 });
  }
  return NextResponse.json({ success: false, error: 'Aksi tidak dikenali.' }, { status: 400 });
}
