import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getInternalSession } from '@/lib/internal-session';
import { createInternalDataClient } from '@/lib/supabase-server';
import { splitStaffNameEntries } from '@/lib/staff-name-utils';

const TRAINER_RATE = 150_000;
const INTERVIEWER_RATE = 30_000;
const INTERVIEWER_NAME_ALIASES = new Map([
  ['victoria berlin murphylaw', 'victoria berlin valencaera'],
  ['victoria berlyn murphylaw', 'victoria berlin valencaera'],
  ['victoria berlin muprhylaw', 'victoria berlin valencaera'],
  ['victoria berlyn muprhylaw', 'victoria berlin valencaera'],
]);
const paymentUpdateSchema = z.object({
  batchId: z.uuid(),
  personnelId: z.uuid().optional(),
  canonicalName: z.string().trim().min(1).max(200).optional(),
  bonusType: z.enum(['TRAINER', 'INTERVIEWER']),
  isPaid: z.boolean(),
}).strict().refine((value) => Boolean(value.personnelId) !== Boolean(value.canonicalName), {
  message: 'Pilih tepat satu identitas personel atau nama whitelist.',
});

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function namesMatchByTokens(inputName, personnelName) {
  const input = normalizeName(inputName).split(' ').filter(Boolean);
  const master = normalizeName(personnelName).split(' ').filter(Boolean);
  if (input.length < 2 || input.length > master.length) return false;

  return input.every((token, index) => {
    const masterToken = master[index];
    if (token === masterToken) return true;
    // Treat initials (for example, "O.") as an abbreviation of that name part.
    if (token.length === 1) return masterToken.startsWith(token);
    // Permit one-character spelling variants (e.g. Berlyn / Berlin), only for
    // sufficiently long tokens and only when the rest of the name also matches.
    if (token.length < 5 || masterToken.length < 5 || Math.abs(token.length - masterToken.length) > 1) return false;
    let previousRow = Array.from({ length: masterToken.length + 1 }, (_, i) => i);
    for (let row = 1; row <= token.length; row += 1) {
      const currentRow = [row];
      for (let column = 1; column <= masterToken.length; column += 1) {
        currentRow[column] = Math.min(
          currentRow[column - 1] + 1,
          previousRow[column] + 1,
          previousRow[column - 1] + (token[row - 1] === masterToken[column - 1] ? 0 : 1),
        );
      }
      previousRow = currentRow;
    }
    return previousRow[masterToken.length] <= 1;
  });
}

function dashboardStaffNameParts(value) {
  if (Array.isArray(value)) return value.flatMap(dashboardStaffNameParts);
  if (typeof value !== 'string' || !value.trim()) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try { return dashboardStaffNameParts(JSON.parse(trimmed)); } catch { /* Use Dashboard's delimiter parsing below. */ }
  }
  // Share Dashboard's delimiter mapping, then resolve each entry to a personnel record.
  return splitStaffNameEntries(trimmed);
}

function findUniqueDirectoryName(normalized, namesByFullName, namesByFirstName) {
  const exactMatches = namesByFullName.get(normalized) || [];
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) return null;

  const tokenMatches = [...namesByFullName.values()].flat().filter((person) => namesMatchByTokens(normalized, person.full_name));
  if (tokenMatches.length === 1) return tokenMatches[0];
  if (tokenMatches.length > 1) return null;

  const inputParts = normalized.split(/\s+/).filter(Boolean);
  if (inputParts.length !== 1) return null;
  const firstName = inputParts[0];
  const matches = namesByFirstName.get(firstName) || [];
  return matches.length === 1 ? matches[0] : null;
}

function resolveWhitelistIdentity(whitelistMatch, personnelByName) {
  const canonicalName = normalizeName(whitelistMatch.full_name);
  const linkedPersonnel = personnelByName.get(canonicalName) || [];
  if (linkedPersonnel.length === 1) {
    return { kind: 'personnel', personnelId: linkedPersonnel[0].id, name: linkedPersonnel[0].full_name };
  }
  if (linkedPersonnel.length > 1) return null;

  return {
    kind: 'whitelist',
    canonicalKey: `whitelist:${canonicalName}`,
    canonicalName: whitelistMatch.full_name,
    name: whitelistMatch.full_name,
  };
}

function resolveDashboardStaffName(name, personnelByName, personnelByFirstName, whitelistByName, whitelistByFirstName) {
  const normalized = normalizeName(name.replace(/^['"]|['"]$/g, ''));
  const forcedCanonicalName = INTERVIEWER_NAME_ALIASES.get(normalized);
  if (forcedCanonicalName) {
    const canonicalMatches = whitelistByName.get(forcedCanonicalName) || [];
    return canonicalMatches.length === 1 ? resolveWhitelistIdentity(canonicalMatches[0], personnelByName) : null;
  }

  const personnelMatch = findUniqueDirectoryName(normalized, personnelByName, personnelByFirstName);
  if (personnelMatch) return { kind: 'personnel', personnelId: personnelMatch.id, name: personnelMatch.full_name };

  const whitelistMatch = findUniqueDirectoryName(normalized, whitelistByName, whitelistByFirstName);
  return whitelistMatch ? resolveWhitelistIdentity(whitelistMatch, personnelByName) : null;
}

export async function GET(request) {
  const session = getInternalSession(request);
  if (!session) return response({ success: false, error: 'Sesi personel diperlukan.' }, 401);
  if (session.role !== 'ADMIN') return response({ success: false, error: 'Halaman ini khusus Admin Team RNT.' }, 403);

  const batchId = z.uuid().safeParse(new URL(request.url).searchParams.get('batch_id'));
  if (!batchId.success) return response({ success: false, error: 'Pilih batch untuk menghitung bonus.' }, 400);

  try {
    const db = createInternalDataClient(session);
    const [batchResult, personnelResult, whitelistResult, assignmentsResult, candidatesResult, paymentsResult] = await Promise.all([
      db.from('recruitment_batches').select('id,name').eq('id', batchId.data).is('deleted_at', null).maybeSingle(),
      db.from('rnt_personnel').select('id,full_name,position,is_active,is_trainer').order('full_name'),
      db.from('rnt_personnel_name_whitelist').select('full_name,normalized_name').eq('is_active', true).order('full_name'),
      db.from('academy_candidate_pics').select('candidate_id,personnel_id').eq('batch_id', batchId.data),
      db.from('candidates').select('interviewer_name,assist_name').eq('batch_id', batchId.data).is('deleted_at', null),
      db.from('personnel_bonus_payments').select('personnel_id,normalized_personnel_name,bonus_type,is_paid').eq('batch_id', batchId.data),
    ]);
    if (paymentsResult.error) {
      console.error('Internal bonus payment schema query failed:', paymentsResult.error);
      return response({
        success: false,
        error: 'Skema pembayaran bonus belum diperbarui. Terapkan migrasi personnel_bonus_payments dan bonus_whitelist_identity, lalu muat ulang halaman.',
      }, 503);
    }
    const failed = [batchResult, personnelResult, whitelistResult, assignmentsResult, candidatesResult, paymentsResult].find((result) => result.error);
    if (failed) throw failed.error;
    if (!batchResult.data) return response({ success: false, error: 'Batch tidak ditemukan.' }, 404);

    const personnel = personnelResult.data || [];
    const personnelById = new Map(personnel.map((person) => [person.id, person]));
    const personnelByName = new Map();
    for (const person of personnel) {
      const normalized = normalizeName(person.full_name);
      if (!personnelByName.has(normalized)) personnelByName.set(normalized, []);
      personnelByName.get(normalized).push(person);
    }
    const personnelByFirstName = new Map();
    for (const person of personnel) {
      const firstName = normalizeName(person.full_name).split(/\s+/)[0];
      if (!personnelByFirstName.has(firstName)) personnelByFirstName.set(firstName, []);
      personnelByFirstName.get(firstName).push(person);
    }
    const whitelistByName = new Map();
    const whitelistByFirstName = new Map();
    for (const person of whitelistResult.data || []) {
      const normalized = normalizeName(person.full_name);
      if (!whitelistByName.has(normalized)) whitelistByName.set(normalized, []);
      whitelistByName.get(normalized).push(person);
      const firstName = normalized.split(/\s+/)[0];
      if (!whitelistByFirstName.has(firstName)) whitelistByFirstName.set(firstName, []);
      whitelistByFirstName.get(firstName).push(person);
    }
    const activeTrainerIds = new Set(personnel.filter((person) => person.is_active && person.is_trainer).map((person) => person.id));
    const paymentByKey = new Map();
    for (const payment of paymentsResult.data || []) {
      const key = payment.personnel_id
        ? `personnel:${payment.personnel_id}:${payment.bonus_type}`
        : payment.normalized_personnel_name
          ? `whitelist:${payment.normalized_personnel_name}:${payment.bonus_type}`
          : null;
      if (key) paymentByKey.set(key, payment.is_paid);
    }
    const trainerCounts = new Map([...activeTrainerIds].map((personnelId) => [personnelId, 0]));
    for (const assignment of assignmentsResult.data || []) {
      if (activeTrainerIds.has(assignment.personnel_id)) trainerCounts.set(assignment.personnel_id, (trainerCounts.get(assignment.personnel_id) || 0) + 1);
    }
    const trainers = [...trainerCounts.entries()].map(([personnelId, assignments]) => {
      const person = personnelById.get(personnelId);
      return {
        personnelId,
        name: person.full_name,
        assignment: assignments,
        bonus: assignments * TRAINER_RATE,
        isPaid: paymentByKey.get(`personnel:${personnelId}:TRAINER`) || false,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'id'));

    const interviewerCounts = new Map();
    const unmappedInterviewerNames = new Set();
    for (const candidate of candidatesResult.data || []) {
      const names = [
        ...dashboardStaffNameParts(candidate.interviewer_name),
        ...dashboardStaffNameParts(candidate.assist_name),
      ];
      const candidateInterviewers = new Map();
      for (const name of names) {
        const identity = resolveDashboardStaffName(name, personnelByName, personnelByFirstName, whitelistByName, whitelistByFirstName);
        const key = identity?.personnelId || identity?.canonicalKey || `unmapped:${normalizeName(name)}`;
        if (!identity) unmappedInterviewerNames.add(name);
        if (!candidateInterviewers.has(key)) {
          candidateInterviewers.set(key, identity
            ? { personnelId: identity.personnelId || null, canonicalName: identity.canonicalName || null, name: identity.name }
            : { personnelId: null, name: name.trim(), needsMapping: true });
        }
      }
      for (const [key, identity] of candidateInterviewers) {
        const previous = interviewerCounts.get(key);
        interviewerCounts.set(key, { ...identity, totalInterviews: (previous?.totalInterviews || 0) + 1 });
      }
    }
    const interviewers = [...interviewerCounts.values()].map(({ personnelId, canonicalName, name, totalInterviews, needsMapping }) => ({
      personnelId,
      canonicalName,
      name,
      totalInterviews,
      bonus: totalInterviews * INTERVIEWER_RATE,
      needsMapping: Boolean(needsMapping),
      isPaid: (personnelId ? paymentByKey.get(`personnel:${personnelId}:INTERVIEWER`) : null)
        ?? (canonicalName ? paymentByKey.get(`whitelist:${normalizeName(canonicalName)}:INTERVIEWER`) : false)
        ?? false,
    })).sort((a, b) => b.totalInterviews - a.totalInterviews || a.name.localeCompare(b.name, 'id'));

    return response({
      success: true,
      batch: batchResult.data,
      rates: { trainer: TRAINER_RATE, interviewer: INTERVIEWER_RATE },
      trainers,
      interviewers,
      unmappedInterviewerNames: [...unmappedInterviewerNames],
    });
  } catch (error) {
    console.error('Internal bonus report query failed:', error);
    return response({ success: false, error: 'Rekap bonus belum dapat dimuat. Pastikan migrasi database terbaru sudah diterapkan.' }, 503);
  }
}

export async function PATCH(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return response({ success: false, error: 'Asal permintaan tidak valid.' }, 403);
  const session = getInternalSession(request);
  if (!session) return response({ success: false, error: 'Sesi personel diperlukan.' }, 401);
  if (session.role !== 'ADMIN') return response({ success: false, error: 'Aksi ini hanya dapat dilakukan Admin Team RNT.' }, 403);

  let body;
  try { body = await request.json(); } catch { return response({ success: false, error: 'Format permintaan tidak valid.' }, 400); }
  const parsed = paymentUpdateSchema.safeParse(body);
  if (!parsed.success) return response({ success: false, error: 'Data status pembayaran tidak valid.' }, 400);

  try {
    const db = createInternalDataClient(session);
    const { batchId, personnelId, canonicalName, bonusType, isPaid } = parsed.data;
    const values = {
      batch_id: batchId,
      personnel_id: personnelId || null,
      personnel_name: canonicalName || null,
      normalized_personnel_name: canonicalName ? normalizeName(canonicalName) : null,
      bonus_type: bonusType,
      is_paid: isPaid,
      updated_by: session.name,
      updated_at: new Date().toISOString(),
    };
    const conflictKey = personnelId
      ? 'batch_id,personnel_id,bonus_type'
      : 'batch_id,normalized_personnel_name,bonus_type';
    const { error } = await db.from('personnel_bonus_payments').upsert(values, { onConflict: conflictKey });
    if (error) throw error;
    return response({ success: true, isPaid });
  } catch (error) {
    console.error('Internal bonus payment status update failed:', error);
    return response({ success: false, error: 'Status pembayaran tidak dapat disimpan.' }, 503);
  }
}
