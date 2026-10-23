alter table public.academy_attendance
  add column if not exists excuse_reason text;
