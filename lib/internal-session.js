import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const INTERNAL_SESSION_COOKIE = 'red_internal_session';
export const REMEMBERED_PIN_COOKIE = 'red_pin_verified';
export const MANUAL_LOGOUT_COOKIE = 'red_manual_logout';
const SESSION_TTL_SECONDS = 60 * 60 * 24;

function getSessionSecret() {
  return process.env.INTERNAL_SESSION_SECRET || '';
}

export function hasSessionSecret() {
  return Buffer.byteLength(getSessionSecret()) >= 32;
}

function signatureFor(payload) {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

function rememberedTokenKey() {
  return createHmac('sha256', getSessionSecret()).update('RNT-remembered-PIN-v1').digest();
}

export function createRememberedPinToken({ personnelId, role, expiresAt }) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', rememberedTokenKey(), iv);
  const payload = Buffer.from(JSON.stringify({ personnelId, role, expiresAt })).toString('utf8');
  const ciphertext = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function readRememberedPinToken(request) {
  if (!hasSessionSecret()) return null;
  const token = request.cookies?.get(REMEMBERED_PIN_COOKIE)?.value;
  if (!token || token.length > 2048) return null;
  const [ivText, tagText, ciphertextText, extra] = token.split('.');
  if (!ivText || !tagText || !ciphertextText || extra) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', rememberedTokenKey(), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const remembered = JSON.parse(plaintext);
    if (!remembered.personnelId || !['STAFF', 'ADMIN'].includes(remembered.role)
      || !Number.isInteger(remembered.expiresAt)
      || remembered.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return remembered;
  } catch {
    return null;
  }
}

export function createInternalSessionToken({ name, role, rank, position, department, personnelId, expiresAt }) {
  const sessionExpiresAt = expiresAt || Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({
    name,
    role,
    rank,
    position,
    department,
    personnelId,
    profileVersion: 3,
    expiresAt: sessionExpiresAt,
  })).toString('base64url');

  return `${payload}.${signatureFor(payload)}`;
}

export function getInternalSession(request) {
  if (!hasSessionSecret()) return null;

  const token = request.cookies?.get(INTERNAL_SESSION_COOKIE)?.value;
  if (!token || token.length > 4096) return null;

  const [payload, suppliedSignature, extra] = token.split('.');
  if (!payload || !suppliedSignature || extra) return null;

  const expectedSignature = signatureFor(payload);
  const expectedBuffer = Buffer.from(expectedSignature);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      !['STAFF', 'ADMIN'].includes(session.role) ||
      !session.name ||
      session.profileVersion !== 3 ||
      !session.personnelId ||
      !session.rank ||
      !['LSPD', 'LSSD', 'SASP'].includes(session.department) ||
      session.expiresAt <= Math.floor(Date.now() / 1000)
    ) return null;
    return {
      name: session.name,
      role: session.role,
      rank: session.rank,
      position: session.position || '',
      department: session.department,
      personnelId: session.personnelId,
      expiresAt: session.expiresAt,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: Math.max(0, Math.floor(maxAge)),
  };
}

export function browserSessionCookieOptions() {
  const options = sessionCookieOptions();
  delete options.maxAge;
  return options;
}
