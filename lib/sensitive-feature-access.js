import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase-server';

// Seed the first owner in the matching database migration. Runtime access always
// comes from the database so changes take effect without a code deployment.
export const SENSITIVE_FEATURE_ALLOWED_NAMES = Object.freeze(['Lucas D Riverra']);

export function normalizeSensitiveAccessName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('id-ID');
}

export async function isSensitiveFeatureAllowed(sessionOrName, db = null) {
  const name = typeof sessionOrName === 'string' ? sessionOrName : sessionOrName?.name;
  const normalizedName = normalizeSensitiveAccessName(name);
  if (!normalizedName) return false;
  try {
    const client = db || createServiceRoleClient();
    const { data, error } = await client.from('rnt_sensitive_feature_access')
      .select('id').eq('normalized_name', normalizedName).eq('is_active', true).maybeSingle();
    if (error) throw error;
    return Boolean(data);
  } catch (error) {
    console.error('Sensitive feature access lookup failed:', error);
    return false;
  }
}

export async function listSensitiveFeatureAccess(db = null) {
  const client = db || createServiceRoleClient();
  const { data, error } = await client.from('rnt_sensitive_feature_access')
    .select('id,full_name,normalized_name,is_active,created_at,created_by')
    .order('full_name');
  if (error) throw error;
  return data || [];
}
