# RED Project Recruitment Portal

## Local setup

Install dependencies with `npm install`, then start the app with `npm run dev`.

Set these server-only environment variables in `.env.local` and in every deployment environment:

- `INTERNAL_SESSION_SECRET`: a unique random secret with at least 32 bytes of entropy.
- `INTERNAL_STAFF_PIN`: the staff portal PIN.
- `INTERNAL_ADMIN_PIN`: the Team RED PIN.

Internal sessions are signed by the server and stored in an HTTP-only cookie. Do not expose these variables with a `NEXT_PUBLIC_` prefix.


## Database update

Apply `supabase/migrations/20261009000000_add_dept_preference.sql` to the Supabase project before saving interview preferences. This adds an optional `dept_preference` field while leaving existing `mapping_dept` values unchanged as final department assignments.
