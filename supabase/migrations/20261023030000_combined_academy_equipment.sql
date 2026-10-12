alter table public.interview_equipment_logs
  drop constraint if exists interview_equipment_logs_item_check;

alter table public.interview_equipment_logs
  add constraint interview_equipment_logs_item_check
  check (item in ('KEY', 'BADGE', 'KIT'));

create or replace function public.update_interview_equipment(
  p_candidate_id text,
  p_batch_id uuid,
  p_item text,
  p_status text,
  p_actor text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_item not in ('KEY', 'BADGE', 'KIT') or p_status not in ('PENDING', 'ISSUED', 'RETURNED')
    or (p_item = 'KIT' and p_status = 'RETURNED') then
    raise exception 'Invalid interview equipment status';
  end if;

  if not exists (
    select 1 from public.candidates c
    where c.id::text = p_candidate_id and c.batch_id = p_batch_id and c.deleted_at is null
  ) then
    raise exception 'Candidate is not active in the academy batch';
  end if;

  insert into public.interview_equipment_status (candidate_id, batch_id, updated_by, updated_at)
  values (p_candidate_id, p_batch_id, p_actor, now())
  on conflict (candidate_id, batch_id) do nothing;

  if p_item = 'KIT' then
    update public.interview_equipment_status
      set key_status = p_status, badge_status = p_status, updated_by = p_actor, updated_at = now()
      where candidate_id = p_candidate_id and batch_id = p_batch_id;
  elsif p_item = 'KEY' then
    update public.interview_equipment_status
      set key_status = p_status, updated_by = p_actor, updated_at = now()
      where candidate_id = p_candidate_id and batch_id = p_batch_id;
  else
    update public.interview_equipment_status
      set badge_status = p_status, updated_by = p_actor, updated_at = now()
      where candidate_id = p_candidate_id and batch_id = p_batch_id;
  end if;

  insert into public.interview_equipment_logs (candidate_id, batch_id, item, status, changed_by)
  values (p_candidate_id, p_batch_id, p_item, p_status, p_actor);
end;
$$;

revoke all on function public.update_interview_equipment(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.update_interview_equipment(text, uuid, text, text, text) to service_role;
