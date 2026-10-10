# RED Project Recruitment Portal

## Local setup

Install dependencies with `npm install`, then start the app with `npm run dev`.

Set these server-only environment variables in `.env.local` and in every deployment environment:

- `INTERNAL_SESSION_SECRET`: a unique random secret with at least 32 bytes of entropy.
- `INTERNAL_PIN_SECRET`: a unique random secret of at least 32 bytes, used to generate the rotating PINs.
- `PIN_GENERATOR_ADMIN_KEY`: a separate random secret of at least 32 bytes, required to reveal the Admin PIN in the generator.

The hidden generator issues separate six-digit STAFF and ADMIN PINs that rotate every 30 seconds. The STAFF PIN is publicly available at the hidden route, while the ADMIN PIN requires `PIN_GENERATOR_ADMIN_KEY`. Internal sessions are signed by the server and stored in an HTTP-only cookie. Do not expose these variables with a `NEXT_PUBLIC_` prefix. The old `INTERNAL_STAFF_PIN` and `INTERNAL_ADMIN_PIN` values are no longer used.


## Database update

Apply `supabase/migrations/20261009000000_add_dept_preference.sql` to the Supabase project before saving interview preferences. This adds an optional `dept_preference` field while leaving existing `mapping_dept` values unchanged as final department assignments.
