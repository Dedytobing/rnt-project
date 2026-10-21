-- Registration closes on the published deadline for the public form. Verified
-- internal staff sessions may finish input for up to 24 hours afterward.
drop function if exists public.register_candidate(text, text, text, uuid);

create function public.register_candidate(p_name text, p_gender text, p_cv_url text, p_batch_id uuid, p_is_internal boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  candidate_id uuid;
  name_lock bigint;
  url_lock bigint;
begin
  if p_name is null or length(btrim(p_name)) not between 2 and 100 then raise exception 'Candidate name is invalid'; end if;
  if p_gender not in ('Male','Female') then raise exception 'Candidate gender is invalid'; end if;
  if p_cv_url is null or length(p_cv_url) > 2048 or lower(p_cv_url) !~ '^https?://' then raise exception 'Candidate CV URL is invalid'; end if;
  if not exists (
    select 1 from public.recruitment_batches b
    where b.id = p_batch_id and b.deleted_at is null
      and now() >= b.registration_start
      and now() <= b.registration_end + case when coalesce(p_is_internal, false) then interval '24 hours' else interval '0 seconds' end
  ) then
    raise exception 'Registration is closed';
  end if;

  name_lock := hashtextextended(lower(btrim(p_name)) || ':' || p_batch_id::text, 0);
  url_lock := hashtextextended(p_cv_url || ':' || p_batch_id::text, 0);
  if name_lock <= url_lock then
    perform pg_advisory_xact_lock(name_lock);
    perform pg_advisory_xact_lock(url_lock);
  else
    perform pg_advisory_xact_lock(url_lock);
    perform pg_advisory_xact_lock(name_lock);
  end if;

  if exists (
    select 1 from public.candidates c
    where c.deleted_at is null and c.batch_id = p_batch_id
      and (lower(btrim(c.nama)) = lower(btrim(p_name)) or c.link_cv = p_cv_url)
  ) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  insert into public.candidates(nama, gender, link_cv, batch_id)
  values (btrim(p_name), p_gender, p_cv_url, p_batch_id)
  returning id into candidate_id;
  insert into public.candidate_logs(candidate_id, officer_name, role_action, action_details)
  values (candidate_id, 'Sistem Publik', 'REGISTER', jsonb_build_object('batch_id', p_batch_id)::text);
  return jsonb_build_object('status', 'created', 'candidate_id', candidate_id::text);
end
$$;

revoke all on function public.register_candidate(text, text, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.register_candidate(text, text, text, uuid, boolean) to service_role;

create or replace function public.register_candidate(p_name text, p_gender text, p_cv_url text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  active_batch uuid;
begin
  select id into active_batch
  from public.recruitment_batches
  where deleted_at is null and now() >= registration_start and now() <= registration_end
  order by registration_start desc
  limit 1;
  if active_batch is null then raise exception 'Registration is closed'; end if;
  return public.register_candidate(p_name, p_gender, p_cv_url, active_batch, false);
end
$$;

revoke all on function public.register_candidate(text, text, text) from public, anon, authenticated;
grant execute on function public.register_candidate(text, text, text) to service_role;
