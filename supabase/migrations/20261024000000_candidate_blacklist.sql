create table if not exists public.candidate_blacklist (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  normalized_name text not null unique,
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.candidate_blacklist enable row level security;
revoke all on public.candidate_blacklist from public, anon, authenticated;
grant all on public.candidate_blacklist to service_role;

