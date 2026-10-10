import { createHmac, timingSafeEqual } from 'node:crypto';

export const INTERNAL_PIN_STEP_SECONDS = 30;
const PIN_DIGITS = 6;

export function hasInternalPinConfig() {
  return Buffer.byteLength(process.env.INTERNAL_PIN_SECRET || '') >= 32;
}

export function createInternalPin(role, timestamp = Date.now()) {
  const secret = process.env.INTERNAL_PIN_SECRET;
  if (!secret || !['STAFF', 'ADMIN'].includes(role)) return null;

  const counter = Math.floor(timestamp / 1000 / INTERNAL_PIN_STEP_SECONDS);
  const digest = createHmac('sha256', secret)
    .update(`RNT-INTERNAL-PIN:${role}:${counter}`)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);

  return String(binary % (10 ** PIN_DIGITS)).padStart(PIN_DIGITS, '0');
}

export function verifyInternalPin(provided, role, timestamp = Date.now()) {
  if (!/^\d{6}$/.test(String(provided || '')) || !hasInternalPinConfig()) return false;

  // Accept adjacent time steps to tolerate small clock differences at rotation boundaries.
  return [-1, 0, 1].some((step) => {
    const expected = createInternalPin(role, timestamp + step * INTERNAL_PIN_STEP_SECONDS * 1000);
    const suppliedBuffer = Buffer.from(String(provided));
    const expectedBuffer = Buffer.from(expected || '');
    return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
  });
}

export function verifyAdminPinGeneratorKey(provided) {
  const configured = process.env.PIN_GENERATOR_ADMIN_KEY || '';
  const configuredBuffer = Buffer.from(configured);
  const providedBuffer = Buffer.from(String(provided || ''));
  return configuredBuffer.length >= 32
    && providedBuffer.length === configuredBuffer.length
    && timingSafeEqual(providedBuffer, configuredBuffer);
}
