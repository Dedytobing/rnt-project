alter table public.academy_attendance
  add column if not exists department_group text;

alter table public.academy_attendance
  drop constraint if exists academy_attendance_department_group_check;

alter table public.academy_attendance
  add constraint academy_attendance_department_group_check
  check (department_group is null or department_group in ('LSPD', 'LSSD', 'DOC'));
