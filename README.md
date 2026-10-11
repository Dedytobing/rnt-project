# RNT Recruitment Portal

## Local setup

Install dependencies with `npm install`, then start the app with `npm run dev`.

Configure these environment variables in `.env.local` and in every deployment environment:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only key used by guarded API routes and the narrow public candidate-registration function. Never add a `NEXT_PUBLIC_` prefix or expose it to browser code.
- `INTERNAL_SESSION_SECRET`: random secret of at least 32 bytes used to sign HttpOnly personnel session cookies.
- `INTERNAL_PIN_SECRET`: random secret of at least 32 bytes used to generate rotating, six-digit PINs.
- `PIN_GENERATOR_ADMIN_KEY`: private Admin verification code of at least 32 bytes. The Admin PIN generator endpoint rejects Admin requests without this code; never expose it to Staff or browser configuration.
- `UPSTASH_REDIS_REST_URL`: Upstash Redis REST URL used by shared rate limits.
- `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST token. Keep it server-only.

Rate-limited endpoints fail closed in production if Redis is not configured or unavailable. Local development uses an in-memory fallback; it does not provide a production-grade shared limit.
The hosting proxy must provide a trusted `x-real-ip` or `cf-connecting-ip` header; configure the platform to overwrite client-supplied values.

## Personnel authentication

The login page asks users to type their name and their rank, division/position, department, role, and PIN; it does not request or display a personnel roster. On submit, the server checks the normalized name and role against `public.rnt_personnel_name_whitelist` without regard to letter case. Whitelisted users can create a profile from their submitted service details after the PIN is verified. The database whitelist determines whether a name is Staff or Admin, so selecting Admin alone cannot grant Admin access. Successful and failed login attempts are written to `public.personnel_audit_logs` with a hashed IP address. Signed HttpOnly sessions expire after eight hours. Rotate `INTERNAL_SESSION_SECRET` to revoke active sessions.

PINs rotate every 30 seconds and are derived from the selected role and requesting IP. Staff PINs appear as soon as the generator opens. To view the Admin PIN, enter the server-configured `PIN_GENERATOR_ADMIN_KEY`; this verification is checked by the server. The generator is available at `/access-control/pin-generator` and needs no personnel selection. The hosting proxy must overwrite `x-real-ip` or `cf-connecting-ip` with the trusted client address. Keep `INTERNAL_PIN_SECRET`, `INTERNAL_SESSION_SECRET`, and `PIN_GENERATOR_ADMIN_KEY` at 32 bytes or longer. Rate limits fail closed in production unless Upstash Redis is available.

After applying the migrations, bootstrap the first Admin by inserting the official identity in `public.rnt_personnel` through the Supabase SQL editor, replacing the example values:

```sql
insert into public.rnt_personnel (full_name, normalized_name, role, rank, position, department)
values ('Official Admin Name', lower(btrim('Official Admin Name')), 'ADMIN', 'Administrator', '', 'LSPD');

insert into public.rnt_personnel_name_whitelist (full_name, normalized_name, role)
values ('Official Admin Name', lower(btrim('Official Admin Name')), 'ADMIN')
on conflict (normalized_name) do update set is_active = true;
```

Subsequent personnel can be added at `/internal/management`. Do not expose the service-role key to Staff.

## Recruitment batches

Apply migrations in order from `supabase/migrations/`:

1. `20261009000000_add_dept_preference.sql`
2. `20261011000000_secure_personnel_access.sql`
3. `20261011120000_shared_pin_session_support.sql`
4. `20261012000000_batches_personnel_academy.sql`
5. `20261013000000_simplify_ip_pin_generator.sql`
6. `20261014000000_personnel_name_whitelist.sql`
7. `20261015000000_personnel_whitelist_roles.sql`
8. `20261016000000_batch_management_review_window.sql`
9. `20261017000000_repair_internal_candidate_access.sql`
10. `20261018000000_academy_attendance_realtime.sql`
11. `20261019000000_academy_multiple_pics.sql`
12. `20261020000000_academy_pic_groups.sql`
13. `20261021000000_bulk_candidate_pic_group.sql`

If the batch migration previously stopped with `Verified personnel identity is required for candidate changes`, rerun `20261012000000_batches_personnel_academy.sql` after deploying this corrected version. It creates `rnt_personnel` and related tables before backfilling candidate batch IDs, and runs that backfill with the candidate audit triggers safely suspended in the same transaction. Then apply migration 130. The migration is designed to be rerun safely.

Migration 140 creates the private personnel whitelist and seeds the supplied names. Migration 150 adds the role stored for each name; the supplied list defaults to Staff except `Blackthorn Lucas D Riverra`, which is Admin. The whitelist is case-insensitive through its `normalized_name` column. New profiles created by Admins are added to the whitelist automatically.

Migration 160 adds soft deletion for recruitment batches and recalculates Review windows for existing batches from the start of Registration through the end of Interview. Admins can add, edit, and soft-delete batches directly from the batch selection screen. New batch schedules use the same derived Review window; the management API also applies this rule.

Migration 190 introduces the many-to-many PIC assignment relation. Migration 200 moves those assignments into batch-level PIC groups, preserving candidates that shared an identical PIC set, and adds atomic Admin operations for group membership and candidate allocation. Migration 210 adds an atomic bulk-allocation function used by the Management PIC screen. Academy Realtime publishes group, member, and candidate-allocation changes so every member sees the same group and attendance updates.

Migration 170 repairs deployments where candidate update triggers still expect Supabase Auth identities. Internal updates now validate the signed portal session forwarded by the server, write the candidate audit row, and ensure soft-delete columns exist.

An Admin creates, edits, and soft-deletes batches from the batch selection screen, including registration, interview, and Academy windows. The Review window is derived from the start of registration through the end of interview. Candidate registration is accepted only for the active batch during its registration window. Existing candidates are assigned to a closed `Legacy sebelum batch`. Review, interview, and Academy APIs check the candidate's batch schedule on the server. The management page assigns Academy PICs within the selected batch. Assigned Staff record attendance in the Academy tab during its scheduled window; Supabase Realtime publishes changes to open sessions, with periodic refresh as a fallback.

After login, personnel choose a batch from interactive cards sorted by the newest registration schedule. The selected batch is remembered for the current browser tab; the Dashboard, Review, Interview, Placement, and Academy views then load data for that batch. Use **Ganti Batch** in the sidebar or page header to switch batches.

