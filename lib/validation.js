import { z } from 'zod';

const cleanText = (max, min = 0) => z.string()
  .transform((value) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())
  .pipe(z.string().min(min).max(max));

const optionalText = (max) => cleanText(max).optional().default('');
const candidateId = z.string().trim().min(1).max(100);
const candidateName = cleanText(100, 2).refine(
  (value) => !/[\[\]\t\r\n\u2028\u2029]/.test(value),
  'Nama tidak boleh memuat tag forum atau baris baru.',
);

export const pinSessionSchema = z.object({
  name: cleanText(80, 2).refine((value) => !/[\[\]\t\r\n\u2028\u2029]/.test(value), 'Nama tidak valid.'),
  role: z.enum(['STAFF', 'ADMIN']),
  pin: z.string().regex(/^(?:\d{6})?$/, 'PIN harus terdiri dari 6 angka.'),
  rank: cleanText(60, 2),
  position: optionalText(100),
  department: z.enum(['LSPD', 'LSSD', 'SASP']),
}).strict();

export const pinGeneratorSchema = z.object({
  role: z.enum(['STAFF', 'ADMIN']),
  adminKey: z.string().min(32).max(256).optional(),
}).strict().superRefine((value, context) => {
  if (value.role === 'ADMIN' && !value.adminKey) {
    context.addIssue({ code: 'custom', path: ['adminKey'], message: 'Kode verifikasi Admin wajib diisi.' });
  }
});

const candidateRegistrationSchema = z.object({
  action: z.literal('ADD_CANDIDATE'),
  nama: candidateName,
  gender: z.enum(['Male', 'Female']),
  linkCv: z.url().max(2048).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
  batchId: z.uuid(),
}).strict();

const evaluationSchema = z.object({
  action: z.literal('UPDATE_EVALUATION'),
  id: candidateId,
  statusCv: z.enum(['Interview', 'Pending', 'Rejected']),
  mdtCheck: z.enum(['Green', 'Yellow', 'Red']),
  catatan: optionalText(5000),
  saran: optionalText(5000),
  notesInvestigator: optionalText(5000),
}).strict();

const interviewSchema = z.object({
  action: z.literal('UPDATE_INTERVIEW'),
  id: candidateId,
  interviewerName: optionalText(100),
  assistName: optionalText(100),
  statusInterview: z.enum(['Passed', 'Pending', 'Failed']),
  deptPreference: z.enum(['', 'LSSD', 'LSPD']).optional().default(''),
  notesInterviewer: optionalText(5000),
}).strict();

const adminOverrideSchema = z.object({
  action: z.literal('ADMIN_OVERRIDE_CANDIDATE'),
  id: candidateId,
  departmentOnly: z.boolean().optional().default(false),
  nama: candidateName.optional(),
  gender: z.enum(['', 'Male', 'Female']).optional(),
  linkCv: z.url().max(2048).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)).optional(),
  statusCv: z.enum(['', 'Interview', 'Pending', 'Accepted', 'Rejected']).optional(),
  mdtCheck: z.enum(['', 'Green', 'Yellow', 'Red']).optional(),
  mappingDept: z.enum(['', 'LSSD', 'LSPD', 'DOC']).optional(),
  statusInterview: z.enum(['', 'Passed', 'Pending', 'Failed', 'Declined']).optional(),
  catatan: optionalText(5000),
  notesInvestigator: optionalText(5000),
  notesInterviewer: optionalText(5000),
}).strict().superRefine((value, context) => {
  if (value.departmentOnly) {
    if (!value.mappingDept) context.addIssue({ code: 'custom', path: ['mappingDept'], message: 'Departemen wajib dipilih.' });
    return;
  }
  for (const field of ['nama', 'statusCv', 'mdtCheck', 'statusInterview']) {
    if (value[field] === undefined) context.addIssue({ code: 'custom', path: [field], message: 'Field wajib diisi.' });
  }
});

export const candidateActionSchema = z.discriminatedUnion('action', [
  candidateRegistrationSchema,
  evaluationSchema,
  interviewSchema,
  adminOverrideSchema,
]);

export const candidateQuerySchema = z.object({
  candidate_id: candidateId.optional(),
  deleted: z.enum(['true', 'false']).optional(),
  batch_id: z.uuid().optional(),
  stage: z.enum(['review', 'interview']).optional(),
}).strict();

export const auditQuerySchema = z.object({}).strict();

export async function readValidatedJson(request, schema, maxBytes = 24000) {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) return { error: 'Ukuran permintaan terlalu besar.', status: 413 };

  try {
    const reader = request.body?.getReader();
    if (!reader) return { error: 'Isi permintaan tidak tersedia.', status: 400 };

    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { error: 'Ukuran permintaan terlalu besar.', status: 413 };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const raw = JSON.parse(new TextDecoder().decode(bytes));
    const result = schema.safeParse(raw);
    return result.success
      ? { data: result.data }
      : { error: 'Format atau nilai permintaan tidak valid.', status: 400 };
  } catch {
    return { error: 'Permintaan JSON tidak valid.', status: 400 };
  }
}
