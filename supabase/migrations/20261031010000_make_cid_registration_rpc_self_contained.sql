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
  normalized_cid text := upper(btrim(p_cid));
  candidate_id uuid;
  lock_key bigint;
begin
  if normalized_cid is null or normalized_cid !~ '^[A-Z0-9]{1,40}$' then
    raise exception 'Candidate CID is invalid';
  end if;
  if p_name is null or length(btrim(p_name)) not between 2 and 100 then
    raise exception 'Candidate name is invalid';
  end if;
  if p_gender is null or p_gender not in ('Male', 'Female') then
    raise exception 'Candidate gender is invalid';
  end if;
  if p_cv_url is null or length(p_cv_url) > 2048 or lower(p_cv_url) !~ '^https?://' then
    raise exception 'Candidate CV URL is invalid';
  end if;
  if not exists (
    select 1
    from public.recruitment_batches b
    where b.id = p_batch_id
      and b.deleted_at is null
      and now() >= b.registration_start
      and now() <= b.registration_end + case
        when coalesce(p_is_internal, false) then interval '24 hours'
        else interval '0 seconds'
      end
  ) then
    raise exception 'Registration is closed';
  end if;

  -- Acquire all uniqueness locks in a stable order to avoid races and deadlocks.
  for lock_key in
    select distinct lock_value
    from unnest(array[
      hashtextextended('candidate-cid:' || p_batch_id::text || ':' || normalized_cid, 0),
      hashtextextended('candidate-name:' || p_batch_id::text || ':' || lower(btrim(p_name)), 0),
      hashtextextended('candidate-cv:' || p_batch_id::text || ':' || p_cv_url, 0)
    ]) as lock_values(lock_value)
    order by lock_value
  loop
    perform pg_advisory_xact_lock(lock_key);
  end loop;

  if exists (
    select 1
    from public.candidates c
    where c.deleted_at is null
      and c.batch_id = p_batch_id
      and (
        upper(btrim(c.cid)) = normalized_cid
        or lower(btrim(c.nama)) = lower(btrim(p_name))
        or c.link_cv = p_cv_url
      )
  ) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  insert into public.candidates(nama, gender, link_cv, batch_id, cid)
  values (btrim(p_name), p_gender, p_cv_url, p_batch_id, normalized_cid)
  returning id into candidate_id;

  insert into public.candidate_logs(candidate_id, officer_name, role_action, action_details)
  values (candidate_id, 'Sistem Publik', 'REGISTER', jsonb_build_object('batch_id', p_batch_id)::text);

  return jsonb_build_object('status', 'created', 'candidate_id', candidate_id::text);
end
$$;

revoke all on function public.register_candidate(text, text, text, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.register_candidate(text, text, text, uuid, boolean, text) to service_role;
