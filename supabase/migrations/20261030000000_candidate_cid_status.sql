alter table public.candidate_blacklist
  alter column full_name drop not null,
  alter column normalized_name drop not null,
  add column if not exists status text not null default 'Blacklist';

alter table public.candidate_blacklist
  drop constraint if exists candidate_blacklist_status_check;
alter table public.candidate_blacklist
  add constraint candidate_blacklist_status_check
  check (status in ('Recommended', 'Yellowlist', 'Blacklist'));

create or replace function public.register_candidate(
  p_name text,
  p_gender text,
  p_cv_url text,
  p_batch_id uuid,
  p_is_internal boolean,
  p_cid text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  registration jsonb;
  normalized_cid text := upper(btrim(p_cid));
begin
  if normalized_cid is null or normalized_cid !~ '^[A-Z0-9]{1,40}$' then
    raise exception 'Candidate CID is invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('candidate-cid:' || p_batch_id::text || ':' || normalized_cid, 0));
  if exists (
    select 1 from public.candidates c
    where c.deleted_at is null and c.batch_id = p_batch_id and upper(btrim(c.cid)) = normalized_cid
  ) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  registration := public.register_candidate(p_name, p_gender, p_cv_url, p_batch_id, p_is_internal);
  if registration ->> 'status' = 'created' then
    update public.candidates
    set cid = normalized_cid
    where id = (registration ->> 'candidate_id')::uuid;
  end if;
  return registration;
end
$$;

revoke all on function public.register_candidate(text, text, text, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.register_candidate(text, text, text, uuid, boolean, text) to service_role;
