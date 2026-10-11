import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createServiceRoleClient(extraHeaders = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Server-side database access is not configured.');
  return createClient(url, serviceKey, {
    global: { headers: extraHeaders },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

/**
 * Shared-PIN sessions are verified by the server-signed HttpOnly cookie.
 * This service-role client must only be created after that session is checked.
 * RLS is still enabled for browser/anon access; API routes are the trust boundary.
 */
export function createInternalDataClient(session) {
  if (!session || !['STAFF', 'ADMIN'].includes(session.role)) {
    throw new Error('Verified internal session is required.');
  }

  return createServiceRoleClient({
    'x-rnt-session-role': session.role,
    'x-rnt-session-name': session.name,
    'x-rnt-personnel-id': session.personnelId || '',
  });
}
