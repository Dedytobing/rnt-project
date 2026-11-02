import { createHmac, timingSafeEqual } from 'node:crypto';

export const INTERNAL_PIN_STEP_SECONDS = 30;
export const PIN_GENERATOR_ADMIN_COOKIE = 'rnt_pin_generator_admin';
export const PIN_GENERATOR_ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 3;
const PIN_DIGITS = 6;

export function hasInternalPinConfig() {
  return Buffer.byteLength(process.env.INTERNAL_PIN_SECRET || '') >= 32;
}

export function createInternalPin(role, timestamp = Date.now(), identity = 'shared') {
  const secret = process.env.INTERNAL_PIN_SECRET;
  if (!secret || !['STAFF', 'ADMIN'].includes(role)) return null;

  const counter = Math.floor(timestamp / 1000 / INTERNAL_PIN_STEP_SECONDS);
  const digest = createHmac('sha256', secret)
    .update(`RNT-INTERNAL-PIN:${role}:${identity}:${counter}`)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);

  return String(binary % (10 ** PIN_DIGITS)).padStart(PIN_DIGITS, '0');
}

export function verifyInternalPin(provided, role, timestamp = Date.now(), identity = 'shared') {
  if (!/^\d{6}$/.test(String(provided || '')) || !hasInternalPinConfig()) return false;

  // Accept adjacent time steps to tolerate small clock differences at rotation boundaries.
  return [-1, 0, 1].some((step) => {
    const expected = createInternalPin(role, timestamp + step * INTERNAL_PIN_STEP_SECONDS * 1000, identity);
    const suppliedBuffer = Buffer.from(String(provided));
    const expectedBuffer = Buffer.from(expected || '');
    return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
  });
}

export function verifyAdminPinGeneratorKey(provided) {
  const configuredBuffer = Buffer.from(process.env.PIN_GENERATOR_ADMIN_KEY || '');
  const providedBuffer = Buffer.from(String(provided || ''));
  return configuredBuffer.length >= 32
    && providedBuffer.length === configuredBuffer.length
    && timingSafeEqual(providedBuffer, configuredBuffer);
}

export function createPinGeneratorAdminSession(timestamp = Date.now()) {
  const expiresAt = Math.floor(timestamp / 1000) + PIN_GENERATOR_ADMIN_SESSION_TTL_SECONDS;
  const secret = process.env.PIN_GENERATOR_ADMIN_KEY || '';
  const signature = createHmac('sha256', secret).update(`RNT-PIN-GENERATOR-ADMIN:v1:${expiresAt}`).digest('base64url');
  return { value: `${expiresAt}.${signature}`, expiresAt };
}

export function verifyPinGeneratorAdminSession(token, timestamp = Date.now()) {
  const secret = process.env.PIN_GENERATOR_ADMIN_KEY || '';
  if (Buffer.byteLength(secret) < 32 || typeof token !== 'string' || token.length > 256) return false;
  const [expiresAtText, suppliedSignature, extra] = token.split('.');
  const expiresAt = Number(expiresAtText);
  const now = Math.floor(timestamp / 1000);
  if (extra || !Number.isInteger(expiresAt) || expiresAt <= now
    || expiresAt > now + PIN_GENERATOR_ADMIN_SESSION_TTL_SECONDS) return false;
  const expectedSignature = createHmac('sha256', secret).update(`RNT-PIN-GENERATOR-ADMIN:v1:${expiresAt}`).digest('base64url');
  const expectedBuffer = Buffer.from(expectedSignature);
  const suppliedBuffer = Buffer.from(suppliedSignature || '');
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

