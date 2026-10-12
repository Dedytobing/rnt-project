-- Keep the login whitelist lookup indexed. normalized_name already has a
-- unique index from the table definition, so avoid creating a duplicate one.
create index if not exists rnt_personnel_name_whitelist_full_name_idx
  on public.rnt_personnel_name_whitelist (full_name);

create index if not exists rnt_personnel_name_whitelist_is_active_idx
  on public.rnt_personnel_name_whitelist (is_active);

-- Candidate records use `nama` and `deleted_at` rather than full_name/is_active.
-- These indexes support active-candidate duplicate checks by normalized name or CV URL.
create index if not exists candidates_active_batch_name_idx
  on public.candidates (batch_id, lower(btrim(nama)))
  where deleted_at is null;

create index if not exists candidates_active_batch_cv_idx
  on public.candidates (batch_id, link_cv)
  where deleted_at is null;
