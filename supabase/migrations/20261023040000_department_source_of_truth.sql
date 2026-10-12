-- Keep candidate department assignment in one canonical column.
UPDATE public.candidates AS candidate
SET mapping_dept = attendance.department_group,
    updated_at = now()
FROM public.academy_attendance AS attendance
WHERE attendance.batch_id = candidate.batch_id
  AND attendance.candidate_id = candidate.id::text
  AND attendance.department_group IS NOT NULL
  AND attendance.department_group IN ('LSPD', 'LSSD', 'DOC');

ALTER TABLE public.academy_attendance
  DROP COLUMN IF EXISTS department_group;
