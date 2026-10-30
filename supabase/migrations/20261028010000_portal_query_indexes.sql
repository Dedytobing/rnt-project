-- Cover batch-scoped reads used by the Academy and interview equipment pages.
create index if not exists academy_attendance_batch_candidate_idx
  on public.academy_attendance (batch_id, candidate_id);

create index if not exists interview_equipment_status_batch_candidate_idx
  on public.interview_equipment_status (batch_id, candidate_id);

create index if not exists rnt_personnel_active_full_name_idx
  on public.rnt_personnel (full_name)
  where is_active = true;

-- Stage queues repeatedly constrain candidates by batch and interview status,
-- then discard soft-deleted rows and inspect CV status.
create index if not exists candidates_active_batch_stage_idx
  on public.candidates (batch_id, status_interview, status_cv)
  where deleted_at is null;
