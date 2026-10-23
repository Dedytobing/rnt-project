alter table public.candidates add column if not exists cid text;
alter table public.candidate_blacklist add column if not exists cid text;

create unique index if not exists candidate_blacklist_cid_unique
  on public.candidate_blacklist (cid) where cid is not null and btrim(cid) <> '';
