-- Allow bonus payment status to be tracked for an active whitelist identity
-- before that person completes their first portal login and gets a personnel ID.
alter table public.personnel_bonus_payments
  add column if not exists personnel_name text,
  add column if not exists normalized_personnel_name text;

-- The original composite primary key includes personnel_id, which implicitly
-- makes that column NOT NULL. Replace it with an equivalent unique index so
-- whitelist-only rows can store a NULL personnel_id.
do $$
declare
  primary_key_name text;
begin
  select constraint_row.conname
    into primary_key_name
  from pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.personnel_bonus_payments'::regclass
    and constraint_row.contype = 'p';

  if primary_key_name is not null then
    execute format('alter table public.personnel_bonus_payments drop constraint %I', primary_key_name);
  end if;
end
$$;

alter table public.personnel_bonus_payments
  alter column personnel_id drop not null;

create unique index if not exists personnel_bonus_payments_batch_personnel_type_uidx
  on public.personnel_bonus_payments (batch_id, personnel_id, bonus_type);

-- PostgreSQL treats NULL values as distinct in a regular unique index, so this
-- keeps ID-based records intact while enforcing one name-based record per batch.
create unique index if not exists personnel_bonus_payments_batch_name_type_uidx
  on public.personnel_bonus_payments (batch_id, normalized_personnel_name, bonus_type);
