-- Store internal bonus payment status per batch and bonus category.
create table if not exists public.personnel_bonus_payments (
  batch_id uuid not null references public.recruitment_batches(id) on delete cascade,
  personnel_id uuid not null references public.rnt_personnel(id) on delete restrict,
  bonus_type text not null check (bonus_type in ('TRAINER', 'INTERVIEWER')),
  is_paid boolean not null default false,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (batch_id, personnel_id, bonus_type)
);

alter table public.personnel_bonus_payments enable row level security;
revoke all on public.personnel_bonus_payments from public, anon, authenticated;
grant all on public.personnel_bonus_payments to service_role;
