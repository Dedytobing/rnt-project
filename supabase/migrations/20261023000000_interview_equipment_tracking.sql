create table if not exists public.interview_equipment_status (
  candidate_id text not null,
  batch_id uuid not null references public.recruitment_batches(id) on delete cascade,
  key_status text not null default 'PENDING' check (key_status in ('PENDING', 'ISSUED', 'RETURNED')),
  badge_status text not null default 'PENDING' check (badge_status in ('PENDING', 'ISSUED', 'RETURNED')),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (candidate_id, batch_id)
);

create table if not exists public.interview_equipment_logs (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null,
  batch_id uuid not null references public.recruitment_batches(id) on delete cascade,
  item text not null check (item in ('KEY', 'BADGE')),
  status text not null check (status in ('PENDING', 'ISSUED', 'RETURNED')),
  changed_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists interview_equipment_logs_batch_candidate_idx
  on public.interview_equipment_logs (batch_id, candidate_id, created_at desc);

alter table public.interview_equipment_status enable row level security;
alter table public.interview_equipment_logs enable row level security;
revoke all on public.interview_equipment_status, public.interview_equipment_logs from public, anon, authenticated;
grant all on public.interview_equipment_status, public.interview_equipment_logs to service_role;

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
  if p_item not in ('KEY', 'BADGE') or p_status not in ('PENDING', 'ISSUED', 'RETURNED') then
    raise exception 'Invalid interview equipment status';
  end if;

  if not exists (
    select 1 from public.candidates c
    where c.id::text = p_candidate_id and c.batch_id = p_batch_id
      and c.deleted_at is null and c.status_cv = 'Interview'
  ) then
    raise exception 'Candidate is not active in the interview batch';
  end if;

  insert into public.interview_equipment_status (candidate_id, batch_id, updated_by, updated_at)
  values (p_candidate_id, p_batch_id, p_actor, now())
  on conflict (candidate_id, batch_id) do nothing;

  if p_item = 'KEY' then
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
