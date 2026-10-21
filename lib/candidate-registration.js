import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function isCandidateServiceConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function registerCandidate({ name, gender, cvUrl, batchId, isInternal = false }) {
  const adminClient = createAdminClient();
  return adminClient.rpc('register_candidate', {
    p_name: name,
    p_gender: gender,
    p_cv_url: cvUrl,
    p_batch_id: batchId,
    p_is_internal: isInternal,
  });
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Server-side database operation is not configured.');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
