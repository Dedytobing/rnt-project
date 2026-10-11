import { createHmac, timingSafeEqual } from 'node:crypto';

export const INTERNAL_SESSION_COOKIE = 'red_internal_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function getSessionSecret() {
  return process.env.INTERNAL_SESSION_SECRET || '';
}

export function hasSessionSecret() {
  return Buffer.byteLength(getSessionSecret()) >= 32;
}

function signatureFor(payload) {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

export function createInternalSessionToken({ name, role, rank, position, department, personnelId }) {
  const payload = Buffer.from(JSON.stringify({
    name,
    role,
    rank,
    position,
    department,
    personnelId,
    profileVersion: 3,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
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
      !['LSPD', 'LSSD'].includes(session.department) ||
      session.expiresAt <= Math.floor(Date.now() / 1000)
    ) return null;
    return {
      name: session.name,
      role: session.role,
      rank: session.rank,
      position: session.position || '',
      department: session.department,
      personnelId: session.personnelId,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}
